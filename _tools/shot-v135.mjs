/* v1.35 截图：任务中心批量处理 / 批量选择 / 删除确认 / 一键顺延全部逾期 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8160);
const DBG = Number(process.env.ST_DBG || 9401);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); });
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, '_tools', 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(500);
const userDir = path.join(OUT, '_profile-shot-v135');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=390,844', '--user-data-dir=' + userDir, '--remote-debugging-port=' + DBG, 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try { const l = JSON.parse(await get('http://127.0.0.1:' + DBG + '/json/list')); const pg = l.find((t) => t.type === 'page'); if (pg) { wsUrl = pg.webSocketDebuggerUrl; break; } } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const q = pend.get(m.id); pend.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
await sleep(1500);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1600);
const seed = await evaluate('(async () => {'
  + ' const st = await import("./js/store.js"); st.resetAll();'
  + ' const math = st.addSubject({ name: "高等数学", emoji: "📐", color: "#ef4444" });'
  + ' const ds = st.addSubject({ name: "数据结构", emoji: "🧩", color: "#8b5cf6" });'
  + ' const en = st.addSubject({ name: "英语", emoji: "📖", color: "#0ea5e9" });'
  + ' const now = new Date(); const dk = (n) => st.dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));'
  + ' const t1 = st.addTodo("复习线性代数第三章", dk(-2), "none", math.id); st.setTodoMinutes(t1.id, 45);'
  + ' const t2 = st.addTodo("背 50 个考研单词", dk(-1), "none", en.id); st.setTodoMinutes(t2.id, 30);'
  + ' const t3 = st.addTodo("二叉树遍历练习", dk(0), "none", ds.id); st.setTodoMinutes(t3.id, 60);'
  + ' const t4 = st.addTodo("整理这一周的错题本", dk(0), "none", ds.id); st.setTodoMinutes(t4.id, 30);'
  + ' st.addTodo("概率论习题 3.1-3.5", dk(1), "none", math.id);'
  + ' st.addTodo("晨读 30 分钟", dk(0), "daily", en.id);'
  + ' return { t1: t1.id, t2: t2.id, t3: t3.id, t4: t4.id };'
  + '})()', true);
await evaluate('location.hash = "#/todos"; "ok"');
await sleep(1200);
await evaluate('window.scrollTo(0, 0); "ok"');
await sleep(300);
await shot('v135-todos-normal');
await evaluate('(function(){ document.querySelector("#todo-batch").click(); return "ok"; })()');
await sleep(400);
await evaluate('(function(){ document.querySelector("[data-id=__T1__]").click(); document.querySelector("[data-id=__T2__]").click(); return "ok"; })()'.replace('__T1__', seed.t1).replace('__T2__', seed.t2));
await sleep(500);
await evaluate('window.scrollTo(0, 0); "ok"');
await sleep(200);
await shot('v135-batch-selected');
await evaluate('(function(){ document.querySelector("#todo-batch-del").click(); return "ok"; })()');
await sleep(600);
await shot('v135-batch-confirm');
await evaluate('(function(){ const b = document.querySelector("#sheet [data-act=no]"); if (b) b.click(); return "ok"; })()');
await sleep(400);
await evaluate('(function(){ const b = document.querySelector("#todo-batch-exit"); if (b) b.click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ const b = document.querySelector("[data-act=snooze-all]"); if (b) b.click(); return "ok"; })()');
await sleep(700);
await shot('v135-snooze-all');
console.log(JSON.stringify({ ok: true, seed }));
ws.close(); edge.kill(); server.kill();
await sleep(300);
process.exit(0);
