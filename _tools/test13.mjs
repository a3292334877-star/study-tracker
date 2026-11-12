/* test13：v1.12 数据体检（重复记录 / 孤儿记录 / 异常时长）
   1) store.js：auditData / dedupeSessions / reassignOrphanSessions / fixAbnormalMinutes
   2) me.js：数据卡「数据体检」入口 + 修复弹层
   3) 版本：sw v28 / manifest 22(1.23) / me 页脚 v1.24
   用法：node _tools/test13.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8133 / 9374） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8133);
const DBG = Number(process.env.ST_DBG || 9374);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store.js 体检函数与 pre-audit 快照',
  ['export function auditData', 'export function dedupeSessions', 'export function reassignOrphanSessions', 'export function fixAbnormalMinutes']
    .every((k) => storeSrc.includes(k)) && storeSrc.includes("saveBackupSnapshot('pre-audit')")
    && storeSrc.includes("if (reason === 'pre-audit') return '体检修复前保护';"), true);
check('me.js 体检入口与弹层',
  meSrc.includes('data-act="audit"') && meSrc.includes('function openAuditSheet')
    && meSrc.includes('function auditSummary') && meSrc.includes('学习记录 v1.24'), true);
check('版本：sw v28 / manifest 22-1.23',
  swSrc.includes("const CACHE = 'study-tracker-v29';")
    && manifestXml.includes('android:versionCode="23"') && manifestXml.includes('android:versionName="1.24"'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile13-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result13.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.kill(); edge.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; } if (m.method === 'Runtime.exceptionThrown') { logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description }; return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

/* ---------- 3. 造一份含三类问题的数据 ---------- */
await evaluate('(() => { const base = { v: 1, seeded: true, settings: { theme: "auto", dailyGoalMin: 120, weekStart: 1, pomodoroMin: 25, autoBackup: true, lastBackupDate: "" }, subjects: [{ id: "s1", name: "数学", emoji: "📐", color: "#4f6df5", goalMinWeek: 0, archived: false, createdAt: 1 }, { id: "s2", name: "英语", emoji: "🗣️", color: "#7d5cff", goalMinWeek: 0, archived: false, createdAt: 1 }], sessions: [ { id: "d1", subjectId: "s1", title: "重复记录", start: 1000000, end: 1000000 + 30 * 60000, minutes: 30, note: "", tags: ["旧"], demo: false }, { id: "d2", subjectId: "s1", title: "重复记录", start: 1000000, end: 1000000 + 30 * 60000, minutes: 30, note: "补充说明", tags: ["新"], demo: false }, { id: "e1", subjectId: "s2", title: "重复二", start: 4000000, end: 4000000 + 10 * 60000, minutes: 10, note: "", tags: [], demo: false }, { id: "e2", subjectId: "s2", title: "重复二", start: 4000000, end: 4000000 + 20 * 60000, minutes: 10, note: "", tags: [], demo: false }, { id: "o1", subjectId: "ghost", title: "孤儿记录", start: 2000000, end: 2000000 + 20 * 60000, minutes: 20, note: "", tags: [], demo: false }, { id: "b1", subjectId: "s1", title: "超长时长", start: 3000000, end: 3000000 + 2000 * 60000, minutes: 2000, note: "", tags: [], demo: false } ], templates: [], todos: [], reviews: {} }; localStorage.setItem("study-tracker/v1", JSON.stringify(base)); location.hash = "#/me"; location.reload(); return "ok"; })()');
await sleep(1600);

const auditPure = await evaluate("(async () => { const st = await import('./js/store.js'); const a = st.auditData(); return { total: a.total, dupGroups: a.duplicates.length, dupCount: a.duplicateCount, orphan: a.orphan.length, abnormal: a.abnormal.length }; })()", true);
check('auditData 识别三类问题', auditPure && auditPure.total === 4 && auditPure.dupGroups === 2
  && auditPure.dupCount === 2 && auditPure.orphan === 1 && auditPure.abnormal === 1, auditPure);

const row = await evaluate("(() => { const r = document.querySelector('[data-act=\"audit\"]'); return { exists: !!r, sub: r ? r.querySelector('#audit-sub').textContent : '', val: r && r.querySelector('.row-val') ? r.querySelector('.row-val').textContent.replace(/\s/g, '') : '' }; })()");
check('我的页体检行摘要', row && row.exists && /发现 4 处可疑数据/.test(row.sub) && String(row.val).replace(/\s/g, '') === '4处', row);

const sheet = await evaluate("(() => { document.querySelector('[data-act=\"audit\"]').click(); const s = document.querySelector('#sheet'); const dup = s.querySelector('[data-fix=\"dup\"]'); return { title: s.querySelector('.sheet-title') ? s.querySelector('.sheet-title').textContent : '', dup: !!dup, orp: !!s.querySelector('[data-fix=\"orphan\"]'), abn: !!s.querySelector('[data-fix=\"abnormal\"]'), dupSub: dup ? dup.textContent : '' }; })()");
check('体检弹层三项可修', sheet && sheet.title === '数据体检' && sheet.dup && sheet.orp && sheet.abn
  && /2 组/.test(sheet.dupSub) && /可清理 2 条/.test(sheet.dupSub), sheet);

const dupFlow = await evaluate(`(async () => {
  document.querySelector('#sheet [data-fix="dup"]').click();
  await new Promise((r) => setTimeout(r, 250));
  const okBtn = document.querySelector('#sheet [data-act="yes"]');
  const okText = okBtn ? okBtn.textContent.trim() : '';
  if (okBtn) okBtn.click();
  await new Promise((r) => setTimeout(r, 500));
  const st = await import('./js/store.js');
  const s = st.getState();
  const keep = s.sessions.find((x) => x.id === 'd1');
  const keep2 = s.sessions.filter((x) => x.title === '重复二').map((x) => x.id);
  const backups = st.listBackups();
  return { okText, dupLeft: s.sessions.filter((x) => x.title === '重复记录').length, keep2, note: keep ? keep.note : '', tags: keep ? keep.tags.join('/') : '', preAudit: backups.some((b) => b.reason === 'pre-audit') };
})()`, true);
check('合并重复：保留最早的、备注/标签合并', dupFlow && dupFlow.okText === '合并'
  && dupFlow.dupLeft === 1 && dupFlow.note === '补充说明' && dupFlow.tags.indexOf('新') >= 0
  && dupFlow.keep2.length === 1 && dupFlow.keep2[0] === 'e1', dupFlow);
check('修复前写入体检保护快照', dupFlow && dupFlow.preAudit === true, dupFlow && dupFlow.preAudit);

const orpFlow = await evaluate(`(async () => {
  document.querySelector('[data-act="audit"]').click();
  await new Promise((r) => setTimeout(r, 250));
  const b = document.querySelector('#sheet [data-fix="orphan"]');
  if (!b) return { missing: true };
  b.click();
  await new Promise((r) => setTimeout(r, 250));
  const y = document.querySelector('#sheet [data-act="yes"]');
  if (y) y.click();
  await new Promise((r) => setTimeout(r, 500));
  const st = await import('./js/store.js');
  const s = st.getState();
  const sub = s.subjects.find((x) => x.name === '未分类');
  const o = s.sessions.find((x) => x.id === 'o1');
  return { hasSubject: !!sub, same: !!(sub && o && o.subjectId === sub.id) };
})()`, true);
check('孤儿记录归入新建「未分类」', orpFlow && orpFlow.hasSubject === true && orpFlow.same === true, orpFlow);

const abnFlow = await evaluate(`(async () => {
  document.querySelector('[data-act="audit"]').click();
  await new Promise((r) => setTimeout(r, 250));
  const b = document.querySelector('#sheet [data-fix="abnormal"]');
  if (!b) return { missing: true };
  b.click();
  await new Promise((r) => setTimeout(r, 250));
  const y = document.querySelector('#sheet [data-act="yes"]');
  if (y) y.click();
  await new Promise((r) => setTimeout(r, 500));
  const st = await import('./js/store.js');
  const s = st.getState();
  const x = s.sessions.find((v) => v.id === 'b1');
  return { minutes: x ? x.minutes : -1, span: x ? Math.round((x.end - x.start) / 60000) : -1 };
})()`, true);
check('异常时长按 24 小时封顶', abnFlow && abnFlow.minutes === 1440 && abnFlow.span === 1440, abnFlow);

const final = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const a = st.auditData();
  const r = document.querySelector('[data-act="audit"]');
  return { total: a.total, sessions: st.getState().sessions.length, sub: r ? r.querySelector('#audit-sub').textContent : '', footer: document.querySelector('.hint.center') ? document.querySelector('.hint.center').textContent : '' };
})()`, true);
check('修复后体检归零且页脚 v1.24', final && final.total === 0 && /一切正常/.test(final.sub)
  && final.sessions === 4 && /学习记录 v1\.24/.test(final.footer.replace(/\s+/g, ' ')), final);

const cleanSheet = await evaluate(`(async () => {
  document.querySelector('[data-act="audit"]').click();
  await new Promise((r) => setTimeout(r, 200));
  const s = document.querySelector('#sheet');
  const desc = s.querySelector('.sheet-desc') ? s.querySelector('.sheet-desc').textContent : '';
  const closeBtn = s.querySelector('[data-act="close"]');
  if (closeBtn) closeBtn.click();
  await new Promise((r) => setTimeout(r, 500));
  return { desc, hidden: document.getElementById('sheet').hidden };
})()`, true);
check('无问题文案与关闭弹层', cleanSheet && /全部正常/.test(cleanSheet.desc) && cleanSheet.hidden === true, cleanSheet);

/* ---------- 汇总 ---------- */
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result13.json'), JSON.stringify({ results }, null, 2));
console.log(results.map((r) => (r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' -> ' + JSON.stringify(r.detail))).join('\n'));
console.log('\n' + passed + '/' + results.length + ' 通过');
if (logs.length) console.log('页面异常：\n' + logs.join('\n'));
ws.close(); edge.kill(); server.kill();
process.exit(passed === results.length ? 0 : 1);