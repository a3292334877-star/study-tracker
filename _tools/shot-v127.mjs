/* v1.27 截图：我的页回收站入口 + 回收站弹层 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8150);
const DBG = Number(process.env.ST_DBG || 9391);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); });
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, '_tools', 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(500);
const userDir = path.join(OUT, '_profile-shot-v127');
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
await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); const subs = [['高等数学','📐','#ef4444'],['数据结构','🧩','#8b5cf6'],['英语','📖','#3b82f6']].map((x) => st.addSubject({ name: x[0], emoji: x[1], color: x[2] })); const mk = (i, title, min, note) => st.addSession({ subjectId: subs[i].id, end: Date.now() - i * 3600 * 1000, minutes: min, title: title, note: note }); mk(0, '极限与连续的错题整理', 45, '夹逼定理还要再练'); mk(1, '二叉树的遍历', 60, '递归写法比较顺'); mk(2, '阅读理解精读', 30, ''); st.addSession({ subjectId: subs[0].id, end: Date.now() - 86400000, minutes: 25, title: '导数公式复习', note: '' }); st.removeSession(st.getState().sessions[1].id); return true; })()", true);
await evaluate('location.hash = "#/me"; "ok"');
await sleep(1000);
await evaluate("(() => { const el = document.querySelector('[data-act=trash]'); if (el) el.scrollIntoView({ block: 'center' }); return true; })()");
await sleep(400);
await shot('v127-me-trash-row');
await evaluate("document.querySelector('[data-act=trash]').click(); 'ok'");
await sleep(700);
await shot('v127-trash-sheet');
console.log(JSON.stringify({ ok: true, out: OUT, files: ['v127-me-trash-row.png', 'v127-trash-sheet.png'] }));
ws.close(); edge.kill(); server.kill();
await sleep(300);
process.exit(0);
