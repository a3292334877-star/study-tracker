/* v1.30.1 截图：记录页批量条默认隐藏 / 点「批量」后才出现 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8154);
const DBG = Number(process.env.ST_DBG || 9395);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); });
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, '_tools', 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(500);
const userDir = path.join(OUT, '_profile-shot-v1301');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=390,844', '--user-data-dir=' + userDir, '--remote-debugging-port=' + DBG, 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try { const l = JSON.parse(await get('http://127.0.0.1:' + DBG + '/json/list')); const p = l.find((t) => t.type === 'page'); if (p) { wsUrl = p.webSocketDebuggerUrl; break; } } catch (_) {}
  await sleep(250);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r.result.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
await sleep(1500);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1600);
await evaluate(`(async () => {
  const st = await import('./js/store.js');
  st.resetAll();
  const math = st.addSubject({ name: '高等数学', emoji: '📐', color: '#ef4444' });
  const ds = st.addSubject({ name: '数据结构', emoji: '🧩', color: '#8b5cf6' });
  const t = Date.now();
  st.addSession({ subjectId: math.id, end: t, minutes: 45, title: '总结微分方程与新学的齐次方程', tags: ['总结复习'] });
  st.addSession({ subjectId: ds.id, end: t - 3600000, minutes: 30, title: '今天学了分组背包', tags: ['首次练习'] });
  st.addSession({ subjectId: math.id, end: t - 86400000, minutes: 15, title: '微分方程习题的练习', tags: ['练习'] });
  st.addSession({ subjectId: ds.id, end: t - 172800000, minutes: 20, title: '二叉树遍历复习', tags: ['复习'] });
  return st.getState().sessions.length;
})()`, true);
await evaluate('location.hash = "#/log"; "ok"');
await sleep(1200);
await evaluate('location.reload(); "ok"');
await sleep(1600);
await shot('v1301-log-normal');
await evaluate("document.querySelector('#log-batch').click(); 'ok'");
await sleep(700);
await shot('v1301-log-batch');
console.log(JSON.stringify({ ok: true }));
ws.close(); edge.kill(); server.kill();
await sleep(300);
process.exit(0);