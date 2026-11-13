/* test31：v1.30 科目合并与数据一致性修复
   静态：store 合并/连续天数/回收站 API、科目页合并入口、回收站文案、版本与 README
   数据：零分钟连续、删除科目进回收站并恢复、科目合并迁移、脏导入归一、存储用量、清空缓存失效
   界面：科目编辑合并入口、回收站显示「删除科目」与来源科目
   用法：node _tools/test31.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8152 / 9393） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8152);
const DBG = Number(process.env.ST_DBG || 9393);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const subjectsSrc = read('js/views/subjects.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const readme = read('README.md');

check('store 合并与连续天数 API',
  storeSrc.includes('export function mergeSubjects')
    && storeSrc.includes('export function hasRecordOn')
    && storeSrc.includes("'pre-subject-delete'")
    && storeSrc.includes("'pre-subject-merge'")
    && storeSrc.includes("typeof extra === 'object'"), true);
check('科目页合并入口与删除文案',
  subjectsSrc.includes('data-act="merge"')
    && subjectsSrc.includes('openMergeSheet')
    && subjectsSrc.includes('移入回收站'), true);
check('回收站支持删除科目来源',
  meSrc.includes("'subject-delete': '删除科目'")
    && meSrc.includes('fallbackName')
    && meSrc.includes('科目「'), true);
check('数据安全修复落在源码',
  storeSrc.includes('invalidateAggregates();')
    && storeSrc.includes('clearCorrupt();')
    && storeSrc.includes('add(TRASH_KEY)')
    && storeSrc.includes('isPlainObject')
    && storeSrc.includes('Number.isFinite'), true);
check('版本：sw v35 / manifest 29-1.30 / 页脚 v1.30',
  swSrc.includes("const CACHE = 'study-tracker-v38';")
    && manifestXml.includes('android:versionCode="32"')
    && manifestXml.includes('android:versionName="1.32"')
    && meSrc.includes('学习记录 v1.32'), true);
check('README v1.30 段与科目合并',
  /^### v1\.30/m.test(readme) && readme.includes('versionCode 29') && readme.includes('科目合并'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile31-' + PORT);
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=390,844', '--user-data-dir=' + userDir, '--remote-debugging-port=' + DBG, 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const l = JSON.parse(await new Promise((res, rej) => { http.get('http://127.0.0.1:' + DBG + '/json/list', (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); }));
    const p = l.find((t) => t.type === 'page');
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(250);
}
if (!wsUrl) {
  check('Edge 启动', false, 'debug port never opened');
  fs.writeFileSync(path.join(OUT, 'result31.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.kill(); edge.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') { logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); }
};
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description }; return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

const seed = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const sub = st.addSubject({ name: '连续测试' }); const now = new Date(); const at = (off, h, m) => { const d = new Date(now); d.setDate(d.getDate() - off); d.setHours(h, m, 0, 0); return d.getTime(); }; st.addSession({ subjectId: sub.id, end: at(0, 10, 0), minutes: 0, title: '今天内容' }); st.addSession({ subjectId: sub.id, end: at(1, 10, 0), minutes: 0, title: '昨天内容' }); st.addSession({ subjectId: sub.id, end: at(2, 10, 0), minutes: 0, title: '前天内容' }); const today = st.dateKey(); return { sessions: st.getState().sessions.length, has: st.hasRecordOn(today), minutes: st.minutesOfDay(today), streak: st.streak(), longest: st.longestStreak() }; })()",
  true
);
check('零分钟记录也计入连续天数', seed && seed.sessions === 3 && seed.has === true && seed.minutes === 0 && seed.streak === 3 && seed.longest === 3, seed);

const rem = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const a = st.addSubject({ name: '物理' }); const b = st.addSubject({ name: '化学' }); const t = Date.now(); st.addSession({ subjectId: a.id, end: t, minutes: 30, title: '力学' }); st.addSession({ subjectId: a.id, end: t - 3600000, minutes: 20, title: '光学' }); st.addSession({ subjectId: b.id, end: t - 7200000, minutes: 10, title: '元素' }); const res = st.removeSubject(a.id); const trash = st.listTrash(); const backups = st.listBackups(); return { removed: res.removed, subjectName: res.subject && res.subject.name, subjects: st.getState().subjects.length, sessions: st.getState().sessions.length, trashBatches: trash.length, trashCount: trash[0] && trash[0].count, trashReason: trash[0] && trash[0].reason, trashSubject: trash[0] && trash[0].subject && trash[0].subject.name, backupReason: backups[0] && backups[0].reason, backupName: backups[0] && backups[0].name }; })()",
  true
);
check('删除科目：记录数与剩余数据正确', rem && rem.removed === 2 && rem.subjects === 1 && rem.sessions === 1, rem);
check('删除科目进回收站并保留来源科目', rem && rem.trashBatches === 1 && rem.trashCount === 2 && rem.trashReason === 'subject-delete' && rem.trashSubject === '物理', rem);
check('删除科目先存保护快照', rem && rem.backupReason === 'pre-subject-delete' && rem.backupName === '删除科目保护', rem);

const rst = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const batch = st.listTrash()[0]; const res = st.restoreTrash(batch.id); return { restored: res.restored, subject: res.subject && res.subject.name, subjects: st.getState().subjects.length, sessions: st.getState().sessions.length, trash: st.listTrash().length }; })()",
  true
);
check('从回收站恢复记录与科目', rst && rst.restored === 2 && rst.subject === '物理' && rst.subjects === 2 && rst.sessions === 3 && rst.trash === 0, rst);

const merge = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const a = st.addSubject({ name: '数学', goalMinWeek: 90 }); const b = st.addSubject({ name: '高数', goalMinWeek: 0 }); const t = Date.now(); st.addSession({ subjectId: a.id, end: t, minutes: 30, title: '极限' }); st.addSession({ subjectId: a.id, end: t - 3600000, minutes: 20, title: '导数' }); st.addTodo('刷题', st.dateKey(), 'none', a.id); st.addTemplate({ subjectId: a.id, title: '公式', minutes: 15, tags: ['复习'] }); const res = st.mergeSubjects(a.id, b.id); const backups = st.listBackups(); const state = st.getState(); return { moved: res.moved, todos: res.todos, templates: res.templates, error: res.error || '', target: res.target, subjects: state.subjects.length, onlyB: state.subjects[0] && state.subjects[0].name, goal: state.subjects[0] && state.subjects[0].goalMinWeek, sessionsAllB: state.sessions.every((s) => s.subjectId === b.id), todosAllB: state.todos.every((x) => x.subjectId === b.id), templatesAllB: state.templates.every((x) => x.subjectId === b.id), backupReason: backups[0] && backups[0].reason, backupName: backups[0] && backups[0].name }; })()",
  true
);
check('科目合并迁移记录/任务/模板', merge && merge.moved === 2 && merge.todos === 1 && merge.templates === 1 && !merge.error && merge.target === '高数', merge);
check('合并后仅剩目标科目并继承周目标', merge && merge.subjects === 1 && merge.onlyB === '高数' && merge.goal === 90 && merge.sessionsAllB && merge.todosAllB && merge.templatesAllB, merge);
check('合并科目先存保护快照', merge && merge.backupReason === 'pre-subject-merge' && merge.backupName === '合并科目保护', merge);

const dirty = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); st.importJSON(JSON.stringify({ subjects: [{ id: 's1', name: '语文', color: '#111111', emoji: '📕', goalMinWeek: 0, archived: false }], sessions: [null, { id: 'x1', subjectId: 's1', title: '脏数据', minutes: '45', start: 'bad', end: 'bad', tags: ['a'] }], settings: {} }), { mode: 'replace' }); const s = st.getState().sessions; return { len: s.length, minutes: s[0] && s[0].minutes, endFinite: Boolean(s[0]) && Number.isFinite(s[0].end) && s[0].end > 0, startFinite: Boolean(s[0]) && Number.isFinite(s[0].start) && s[0].start > 0, tags: Boolean(s[0]) && Array.isArray(s[0].tags) && s[0].tags[0] === 'a' }; })()",
  true
);
check('脏导入被归一（null 过滤 / 字符串分钟转数字）', dirty && dirty.len === 1 && dirty.minutes === 45 && dirty.endFinite && dirty.startFinite && dirty.tags, dirty);

const size = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const a = st.addSubject({ name: '存储' }); const s = st.addSession({ subjectId: a.id, end: Date.now(), minutes: 10, title: 'x' }); st.removeSession(s.id); const raw = localStorage.getItem('study-tracker/trash/v1'); return { trashLen: raw ? raw.length : 0, estimate: st.estimateStorageBytes(), trashBatches: st.listTrash().length }; })()",
  true
);
check('存储用量计入回收站', size && size.trashLen > 0 && size.trashBatches === 1 && size.estimate > size.trashLen, size);

const cache = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const a = st.addSubject({ name: '缓存' }); st.addSession({ subjectId: a.id, end: Date.now(), minutes: 5, title: 'x' }); const before = st.allSessions().length; st.resetAll(); const after = st.allSessions().length; return { before: before, after: after, stateSessions: st.getState().sessions.length, streak: st.streak() }; })()",
  true
);
check('清空数据后聚合缓存失效', cache && cache.before === 1 && cache.after === 0 && cache.stateSessions === 0 && cache.streak === 0, cache);

const subjects = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const a = st.addSubject({ name: '地理' }); const b = st.addSubject({ name: '历史' }); const t = Date.now(); st.addSession({ subjectId: a.id, end: t, minutes: 30, title: '气候' }); window.__AID = a.id; window.__BID = b.id; return { a: a.id, b: b.id }; })()",
  true
);
await evaluate('location.hash = "#/subjects"; "ok"');
await sleep(1000);
await evaluate('document.querySelector(\'[data-subject="' + subjects.a + '"]\').click(); "ok"');
await sleep(700);
await evaluate("document.querySelector('[data-act=edit]').click(); 'ok'");
await sleep(700);
const editSheet = await evaluate("(() => { const btn = document.querySelector('[data-act=merge]'); const titles = Array.from(document.querySelectorAll('.sheet-title')).map((x) => x.textContent.trim()); return { exists: Boolean(btn), titles: titles }; })()");
check('科目编辑弹层有合并入口', editSheet && editSheet.exists, editSheet);
await evaluate("document.querySelector('[data-act=merge]').click(); 'ok'");
await sleep(700);
const mergeSheet = await evaluate("(() => { const titles = Array.from(document.querySelectorAll('.sheet-title')).map((x) => x.textContent.trim()); const targets = document.querySelectorAll('[data-merge-target]').length; return { titles: titles, targets: targets }; })()");
check('打开合并科目弹层', mergeSheet && mergeSheet.titles.some((t) => t.indexOf('合并') >= 0) && mergeSheet.targets >= 1, mergeSheet);

await evaluate("(async () => { const st = await import('./js/store.js'); st.removeSubject(window.__AID); return st.listTrash().length; })()", true);
await evaluate('location.hash = "#/me"; "ok"');
await sleep(1000);
await evaluate("document.querySelector('[data-act=trash]').click(); 'ok'");
await sleep(800);
const trashUI = await evaluate("(() => { const meta = document.querySelector('.mez-backup-meta'); const preview = document.querySelector('.mez-trash-preview'); return { meta: meta ? meta.textContent.trim() : '', preview: preview ? preview.textContent.trim() : '', sheet: !!document.querySelector('#mez-trash-list') }; })()");
check('回收站显示删除科目与来源科目', trashUI && trashUI.sheet && trashUI.meta.indexOf('删除科目') >= 0 && trashUI.meta.indexOf('地理') >= 0 && trashUI.preview.indexOf('地理') >= 0, trashUI);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result31.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
