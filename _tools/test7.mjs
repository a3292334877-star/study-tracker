/* test7：v1.6 数据可靠性校验
   1) 版本一致性：SW 缓存号 / APK 版本 / 存储提示位 / 移除示例数据入口
   2) 写盘失败必须显性提示（横幅出现、可关闭、给导出入口）
   3) 移除示例数据只删 demo 内容，用户自己记的保留
   4) 清空 / 合并导入前都自动留保护快照
   5) 数据文件损坏时用最近一份备份恢复，原始内容另存留档
   用法：node _tools/test7.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8127);
const DBG = Number(process.env.ST_DBG || 9360);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态一致性（不需要浏览器） ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const swSrc = read('sw.js');
const manifest = read('android/AndroidManifest.xml');
const indexHtml = read('index.html');
const meSrc = read('js/views/me.js');
const storeSrc = read('js/store.js');
const pkg = {
  sw: (swSrc.match(/const CACHE = '([^']+)'/) || [])[1] || '',
  versionCode: (manifest.match(/android:versionCode="(\d+)"/) || [])[1] || '',
  versionName: (manifest.match(/android:versionName="([^"]+)"/) || [])[1] || '',
  banner: /id="storage-warn"/.test(indexHtml),
  meVersion: /学习记录 v1\.34/.test(meSrc),
  demoRow: /data-act="clear-demo"/.test(meSrc),
  clearDemoExport: /export function clearDemo\(\)/.test(storeSrc),
  preClearLabel: /清空前保护/.test(storeSrc),
  corruptKey: /study-tracker\/corrupt\//.test(storeSrc),
};
check('v1.24 版本一致性', pkg.sw === 'study-tracker-v40' && pkg.versionCode === '34' && pkg.versionName === '1.34', pkg);
check('可靠性入口已就绪', pkg.banner && pkg.meVersion && pkg.demoRow && pkg.clearDemoExport && pkg.preClearLabel && pkg.corruptKey, pkg);

/* ---------- 2. 启动静态服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile7-' + PORT);
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=390,844', '--user-data-dir=' + userDir, '--remote-debugging-port=' + DBG, 'about:blank',
], { stdio: 'ignore' });

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
let wsUrl = null;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = JSON.parse(await get('http://127.0.0.1:' + DBG + '/json/list'));
    const page = list.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(250);
}
if (!wsUrl) { console.error('no devtools'); server.kill(); edge.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push({ type: msg.params.type, text: (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ') });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
  }
  if (msg.method === 'Log.entryAdded') logs.push({ type: 'log:' + msg.params.entry.level, text: msg.params.entry.text });
};
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expr, awaitPromise = false) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  if (res.exceptionDetails) return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  return res.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL + '#/home' });
await sleep(1400);

/* ---------- 3. 写盘失败要显性提示 ---------- */
const warn = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const sub = S.getState().subjects[0] || S.addSubject({ name: "探针科目", emoji: "📐", color: "#4f6df5" });'
  + ' const orig = Storage.prototype.setItem;'
  + ' Storage.prototype.setItem = function () { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };'
  + ' let threw = false;'
  + ' try { S.addSession({ subjectId: sub.id, title: "写盘失败探针", minutes: 15, end: Date.now() }); } catch (e) { threw = true; }'
  + ' Storage.prototype.setItem = orig;'
  + ' const bar = document.getElementById("storage-warn");'
  + ' const linkEl = bar ? bar.querySelector("a") : null;'
  + ' return { threw: threw, hidden: bar ? bar.hidden : null, text: bar ? bar.textContent.trim() : "", link: linkEl ? linkEl.getAttribute("href") === "#/me" : false };'
  + '})()', true);
check('写盘失败弹出常驻提示', warn && warn.hidden === false && String(warn.text).indexOf('存储空间') >= 0 && warn.link === true, warn);

/* 写入恢复正常后提示条要自己收起，再次写失败要重新出现 */
const recover = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const sub = S.getState().subjects[0];'
  + ' S.addSession({ subjectId: sub.id, title: "恢复探针", minutes: 4, end: Date.now() });'
  + ' const afterOk = document.getElementById("storage-warn").hidden;'
  + ' const orig = Storage.prototype.setItem;'
  + ' Storage.prototype.setItem = function () { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };'
  + ' let threw = false;'
  + ' try { S.addSession({ subjectId: sub.id, title: "二次失败探针", minutes: 3, end: Date.now() }); } catch (e) { threw = true; }'
  + ' Storage.prototype.setItem = orig;'
  + ' return { afterOk: afterOk, threw: threw, shownAgain: document.getElementById("storage-warn").hidden === false };'
  + '})()', true);
check('写入恢复后提示条自动收起、再失败重新出现', recover && recover.afterOk === true && recover.shownAgain === true, recover);

const dismissed = await evaluate('(() => { const b = document.querySelector("#storage-warn [data-close]"); if (b) b.click(); return document.getElementById("storage-warn").hidden; })()');
check('存储提示可手动关闭', dismissed === true, { dismissed });

/* ---------- 4. 移除示例数据：清空本地重载，回到「首次打开」的示例态 ---------- */
await evaluate('(() => { localStorage.clear(); return true; })()');
await send('Page.reload', { ignoreCache: true });
await sleep(1800);
const seeded = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const sub = S.addSubject({ name: "用户科目", emoji: "📘", color: "#22c55e" });'
  + ' S.addSession({ subjectId: sub.id, title: "用户记录", minutes: 20, end: Date.now() - 1800000 });'
  + ' S.addTodo("用户任务");'
  + ' const st = S.getState();'
  + ' return { demo: st.demo, demoFlag: S.hasDemoData(), sessions: st.sessions.length, demoSessions: st.sessions.filter(function (s) { return s.demo; }).length, subjects: st.subjects.length };'
  + '})()', true);
check('示例数据带 demo 标记', seeded && seeded.demoFlag === true && seeded.sessions > 0 && seeded.demoSessions > 0, seeded);

await evaluate('location.hash = "#/me"');
await sleep(900);
const demoRow = await evaluate('(() => ({ row: Boolean(document.querySelector("[data-act=clear-demo]")), text: (document.getElementById("view").textContent || "") }))()');
check('我的页出现「移除示例数据」', demoRow && demoRow.row === true && String(demoRow.text).indexOf('移除示例数据') >= 0, { row: demoRow && demoRow.row });

await evaluate('(() => { const b = document.querySelector("[data-act=clear-demo]"); if (b) b.click(); })()');
await sleep(500);
const confirmOpen = await evaluate('(() => ({ open: !document.getElementById("sheet").hidden, title: (document.querySelector("#sheet .sheet-title") || {}).textContent || "" }))()');
check('移除前先确认', confirmOpen && confirmOpen.open === true && String(confirmOpen.title).indexOf('移除示例数据') >= 0, confirmOpen);

await evaluate('(() => { const b = document.querySelector("#sheet [data-act=yes]"); if (b) b.click(); })()');
await sleep(700);
const cleared = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const st = S.getState();'
  + ' return {'
  + '  toast: (document.getElementById("toast") || {}).textContent || "",'
  + '  rowGone: !document.querySelector("[data-act=clear-demo]"),'
  + '  sessions: st.sessions.length,'
  + '  userKept: st.sessions.some(function (s) { return s.title === "用户记录"; }),'
  + '  demoSessions: st.sessions.filter(function (s) { return s.demo; }).length,'
  + '  userTodo: st.todos.some(function (t) { return t.text === "用户任务"; }),'
  + '  demoTodos: st.todos.filter(function (t) { return t.demo; }).length,'
  + '  hasDemo: S.hasDemoData()'
  + ' };'
  + '})()', true);
check('移除示例数据保留用户内容', cleared && cleared.userKept === true && cleared.demoSessions === 0
  && cleared.userTodo === true && cleared.demoTodos === 0 && cleared.hasDemo === false && cleared.rowGone === true, cleared);
check('移除示例数据有反馈', cleared && String(cleared.toast).indexOf('已移除') >= 0, { toast: cleared && cleared.toast });

/* ---------- 5. 清空 / 导入前自动留快照 ---------- */
const preClear = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const sub = S.getState().subjects[0] || S.addSubject({ name: "清空前科目", emoji: "📗", color: "#f79009" });'
  + ' S.addSession({ subjectId: sub.id, title: "清空前记录", minutes: 30, end: Date.now() });'
  + ' const beforeSessions = S.getState().sessions.length;'
  + ' const beforeCount = S.listBackups().length;'
  + ' S.resetAll();'
  + ' const list = S.listBackups();'
  + ' const st = S.getState();'
  + ' return {'
  + '  beforeSessions: beforeSessions, beforeCount: beforeCount, afterCount: list.length,'
  + '  reason: list[0] ? list[0].reason : null, name: list[0] ? list[0].name : null,'
  + '  keptSessions: list[0] && list[0].state ? list[0].state.sessions.length : null,'
  + '  sessions: st.sessions.length, subjects: st.subjects.length, seeded: st.seeded, demo: st.demo'
  + ' };'
  + '})()', true);
check('清空前自动存保护快照', preClear && preClear.reason === 'pre-clear' && preClear.name === '清空前保护'
  && preClear.keptSessions === preClear.beforeSessions && preClear.afterCount === preClear.beforeCount + 1, preClear);
check('清空后不再自动灌示例', preClear && preClear.sessions === 0 && preClear.subjects === 0 && preClear.seeded === true && preClear.demo === false, preClear);

const mergeSnap = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const beforeCount = S.listBackups().length;'
  + ' const res = S.importJSON(S.exportJSON(), { mode: "merge" });'
  + ' const list = S.listBackups();'
  + ' return { beforeCount: beforeCount, afterCount: list.length, reason: list[0] ? list[0].reason : null, name: list[0] ? list[0].name : null, res: res };'
  + '})()', true);
check('合并导入前自动存快照', mergeSnap && mergeSnap.reason === 'pre-import' && mergeSnap.name === '导入前保护'
  && mergeSnap.afterCount === mergeSnap.beforeCount + 1, mergeSnap);

/* ---------- 6. 数据损坏：用最近备份恢复 ---------- */
const prepared = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const sub = S.addSubject({ name: "恢复科目", emoji: "📙", color: "#12b76a" });'
  + ' S.addSession({ subjectId: sub.id, title: "恢复验证记录", minutes: 45, end: Date.now() - 3600000 });'
  + ' const snap = S.saveBackupSnapshot("manual", "恢复验证");'
  + ' const broken = String.fromCharCode(123) + " 这不是 JSON";'
  + ' localStorage.setItem("study-tracker/v1", broken);'
  + ' return { snap: Boolean(snap), snapshotSessions: snap ? snap.state.sessions.length : 0, broken: broken };'
  + '})()', true);
check('准备损坏数据与可用备份', prepared && prepared.snap === true && prepared.snapshotSessions >= 1, prepared);

await send('Page.reload', { ignoreCache: true });
await sleep(1800);
const recovered = await evaluate('(async () => {'
  + ' const S = await import("/js/store.js");'
  + ' const st = S.getState();'
  + ' let keptKeys = 0;'
  + ' for (let i = 0; i < localStorage.length; i += 1) { if (String(localStorage.key(i)).indexOf("study-tracker/corrupt/") === 0) keptKeys += 1; }'
  + ' const stored = String(localStorage.getItem("study-tracker/v1") || "");'
  + ' return {'
  + '  sessions: st.sessions.length,'
  + '  recovered: st.sessions.some(function (s) { return s.title === "恢复验证记录"; }),'
  + '  subjects: st.subjects.length,'
  + '  keptKeys: keptKeys,'
  + '  storedOk: stored.indexOf("恢复验证记录") >= 0,'
  + '  toast: (document.getElementById("toast") || {}).textContent || ""'
  + ' };'
  + '})()', true);
check('数据损坏时用最近备份恢复', recovered && recovered.recovered === true && recovered.sessions >= 1
  && recovered.subjects >= 1 && recovered.storedOk === true, recovered);
check('损坏原始内容另存留档', recovered && recovered.keptKeys >= 1, { keptKeys: recovered && recovered.keptKeys });
check('恢复后提示用户', recovered && String(recovered.toast).indexOf('恢复') >= 0, { toast: recovered && recovered.toast });

/* ---------- 7. 无报错 + 输出 ---------- */
const errors = logs.filter((l) => l.type === 'exception' || l.type === 'error' || l.type === 'log:error');
check('控制台无错误', errors.length === 0, errors);

fs.writeFileSync(path.join(OUT, 'result7.json'), JSON.stringify({ results, logs: logs.slice(0, 30) }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed }, null, 2));

ws.close();
edge.kill();
server.kill();
process.exit(failed.length ? 1 : 0);