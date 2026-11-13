/* test28：v1.27 记录回收站
   静态：store 回收站 API / 删除入口接入 / me 入口与弹层 / 样式 / 版本
   数据：单条与批量删除进回收站、恢复、永久删除、30 天过期、20 批上限、清空、resetAll
   界面：我的页入口、回收站弹层、恢复确认与恢复结果
   用法：node _tools/test28.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8148 / 9389） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8148);
const DBG = Number(process.env.ST_DBG || 9389);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const meSrc = read('js/views/me.js');
const meCss = read('css/parts/me.css');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 回收站 API',
  storeSrc.includes("const TRASH_KEY = 'study-tracker/trash/v1'")
    && storeSrc.includes('export function listTrash')
    && storeSrc.includes('export function trashStats')
    && storeSrc.includes('export function pushTrash')
    && storeSrc.includes('export function restoreTrash')
    && storeSrc.includes('export function removeTrash')
    && storeSrc.includes('export function clearTrash'), true);
check('删除入口写入回收站',
  storeSrc.includes("pushTrash([removed], 'delete')")
    && storeSrc.includes("pushTrash(removed, 'batch-delete')")
    && storeSrc.includes('dropTrashSessions([session.id])')
    && storeSrc.includes('clearTrash();'), true);
check('我的页回收站入口与弹层',
  meSrc.includes('data-act="trash"')
    && meSrc.includes('function openTrashSheet')
    && meSrc.includes('function trashListHTML')
    && meSrc.includes('data-restore')
    && meSrc.includes('data-purge'), true);
check('回收站样式与版本',
  meCss.includes('.mez-trash-preview')
    && swSrc.includes("const CACHE = 'study-tracker-v37';")
    && manifestXml.includes('android:versionCode="31"')
    && manifestXml.includes('android:versionName="1.31"')
    && meSrc.includes('学习记录 v1.31'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile28-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result28.json'), JSON.stringify({ results }, null, 2));
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

const seeded = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const sub = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const mk = (title, min, note) => st.addSession({ subjectId: sub.id, end: Date.now(), minutes: min, title: title, note: note }); mk('极限', 45, '第一章'); mk('导数', 30, ''); mk('积分', 60, '错题'); return { sessions: st.getState().sessions.length }; })()",
  true
);
check('种子：重置后 3 条记录', seeded && seeded.sessions === 3, seeded);

const single = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const id = st.getState().sessions[0].id; const removed = st.removeSession(id); const list = st.listTrash(); return { removed: !!removed, sessions: st.getState().sessions.length, batches: list.length, count: list.reduce((n, x) => n + x.sessions.length, 0), reason: list[0] && list[0].reason, totalMin: list[0] && list[0].totalMin, title: list[0] && list[0].sessions[0].title }; })()",
  true
);
check('单条删除进入回收站', single && single.removed && single.sessions === 2 && single.batches === 1 && single.count === 1, single);
check('回收站保留原记录信息', single && single.reason === 'delete' && single.totalMin === 45 && single.title === '极限', single);

const restored = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const id = st.listTrash()[0].id; const res = st.restoreTrash(id); return { restored: res.restored, sessions: st.getState().sessions.length, count: st.trashStats().count, hasTitle: st.getState().sessions.some((s) => s.title === '极限') }; })()",
  true
);
check('从回收站恢复记录', restored && restored.restored === 1 && restored.sessions === 3 && restored.count === 0 && restored.hasTitle, restored);

const batch = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const ids = st.getState().sessions.slice(0, 2).map((s) => s.id); st.removeSessions(ids); const list = st.listTrash(); return { sessions: st.getState().sessions.length, batches: list.length, count: list.reduce((n, x) => n + x.sessions.length, 0), reason: list[0] && list[0].reason }; })()",
  true
);
check('批量删除合并为一批', batch && batch.sessions === 1 && batch.batches === 1 && batch.count === 2 && batch.reason === 'batch-delete', batch);

const batchRestored = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const res = st.restoreTrash(st.listTrash()[0].id); return { restored: res.restored, sessions: st.getState().sessions.length, count: st.trashStats().count }; })()",
  true
);
check('批量恢复记录', batchRestored && batchRestored.restored === 2 && batchRestored.sessions === 3 && batchRestored.count === 0, batchRestored);

const purge = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.pushTrash([{ id: 'a', title: 'A', minutes: 5 }], 'delete'); st.pushTrash([{ id: 'b', title: 'B', minutes: 8 }], 'delete'); const before = st.trashStats(); const n = st.removeTrash(st.listTrash()[0].id); const after = st.trashStats(); return { beforeBatches: before.batches, beforeCount: before.count, removed: n, afterBatches: after.batches, afterCount: after.count }; })()",
  true
);
check('永久删除一批回收站记录', purge && purge.beforeBatches === 2 && purge.beforeCount === 2 && purge.removed === 1 && purge.afterBatches === 1 && purge.afterCount === 1, purge);

const ttl = await evaluate(
  "(async () => { const st = await import('./js/store.js'); localStorage.setItem('study-tracker/trash/v1', JSON.stringify([{ id: 'old', at: Date.now() - 31 * 86400000, reason: 'delete', sessions: [{ id: 'gone', title: '过期', minutes: 10 }] }])); const n = st.trashStats().count; const raw = localStorage.getItem('study-tracker/trash/v1'); return { count: n, raw: raw }; })()",
  true
);
check('回收站 30 天过期清理', ttl && ttl.count === 0 && ttl.raw === '[]', ttl);

const capped = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.clearTrash(); for (let i = 0; i < 22; i++) st.pushTrash([{ id: 'b' + i, title: 'T' + i, minutes: 1 }], 'delete'); const list = st.listTrash(); return { batches: list.length, count: st.trashStats().count, newest: list[0] && list[0].sessions[0].id }; })()",
  true
);
check('回收站最多保留 20 批', capped && capped.batches === 20 && capped.count === 20 && capped.newest === 'b21', capped);

const cleared = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const n = st.clearTrash(); return { removed: n, count: st.trashStats().count }; })()",
  true
);
check('清空回收站', cleared && cleared.removed === 20 && cleared.count === 0, cleared);

const resetClears = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.pushTrash([{ id: 'r', title: 'R', minutes: 1 }], 'delete'); const before = st.trashStats().count; st.resetAll(); return { before: before, after: st.trashStats().count }; })()",
  true
);
check('清空所有数据同时清空回收站', resetClears && resetClears.before === 1 && resetClears.after === 0, resetClears);

const uiSeed = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const sub = st.addSubject({ name: '英语', emoji: '📖', color: '#3b82f6' }); st.addSession({ subjectId: sub.id, end: Date.now(), minutes: 30, title: '单词', note: '' }); st.addSession({ subjectId: sub.id, end: Date.now(), minutes: 20, title: '阅读', note: '' }); const id = st.getState().sessions[0].id; st.removeSession(id); return { sessions: st.getState().sessions.length, trash: st.trashStats().count }; })()",
  true
);
check('界面用例种子：1 条记录 + 回收站 1 条', uiSeed && uiSeed.sessions === 1 && uiSeed.trash === 1, uiSeed);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const row = await evaluate("(() => { const el = document.querySelector('[data-act=trash]'); return { exists: !!el, text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '' }; })()");
check('我的页显示回收站入口与条数', row && row.exists && row.text.indexOf('记录回收站') >= 0 && row.text.indexOf('1 条') >= 0, row);

await evaluate("document.querySelector('[data-act=trash]').click(); 'ok'");
await sleep(500);
const sheet = await evaluate("(() => { const rows = document.querySelectorAll('#mez-trash-list .mez-trash-row'); const first = rows[0]; return { title: document.querySelector('.sheet-title') ? document.querySelector('.sheet-title').textContent.trim() : '', rows: rows.length, restore: !!(first && first.querySelector('[data-restore]')), purge: !!(first && first.querySelector('[data-purge]')), preview: first && first.querySelector('.mez-trash-preview') ? first.querySelector('.mez-trash-preview').textContent : '' }; })()");
check('回收站弹层展示批次与操作', sheet && sheet.title === '记录回收站' && sheet.rows === 1 && sheet.restore && sheet.purge && sheet.preview.indexOf('单词') >= 0, sheet);

await evaluate("document.querySelector('#mez-trash-list [data-restore]').click(); 'ok'");
await sleep(450);
const confirm = await evaluate("(() => { const yes = document.querySelector('[data-act=yes]'); return { yes: !!yes, text: yes ? yes.textContent.trim() : '', title: document.querySelector('.sheet-title') ? document.querySelector('.sheet-title').textContent.trim() : '' }; })()");
check('恢复前弹出确认', confirm && confirm.yes && confirm.text === '恢复' && confirm.title.indexOf('恢复这 1 条记录') >= 0, confirm);
await evaluate("document.querySelector('[data-act=yes]').click(); 'ok'");
await sleep(800);
const afterRestore = await evaluate("(async () => { const st = await import('./js/store.js'); return { sessions: st.getState().sessions.length, trash: st.trashStats().count, empty: !!document.querySelector('#mez-trash-list .mez-empty'), title: document.querySelector('.sheet-title') ? document.querySelector('.sheet-title').textContent.trim() : '' }; })()", true);
check('界面恢复后记录回来且回收站清空', afterRestore && afterRestore.sessions === 2 && afterRestore.trash === 0 && afterRestore.empty, afterRestore);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result28.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
