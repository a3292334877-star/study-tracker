/* 用桌面 Edge 渲染连续打卡分享卡并导出 PNG：node streak-shot.mjs <ROOT> <OUT.png> [EDGE] */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3];
const EDGE = process.argv[4] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 8125;
const DBG = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const p = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}

const profile = path.join(ROOT, '_shots', '_streak-profile');
fs.rmSync(profile, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--user-data-dir=' + profile, '--remote-debugging-port=' + DBG, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = JSON.parse(await get('http://127.0.0.1:' + DBG + '/json/list'));
    const page = list.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(200);
}
if (!wsUrl) { console.error('no devtools'); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails && msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : 'exception');
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' '));
};
function send(method, params) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
  return new Promise((resolve) => pending.set(mid, resolve));
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.result && r.result.exceptionDetails) return { error: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || 'eval error' };
  return { value: r.result && r.result.result ? r.result.result.value : undefined };
}

await send('Runtime.enable');
await send('Page.enable');

const BASE = 'http://127.0.0.1:' + PORT;
await send('Page.navigate', { url: BASE + '/index.html' });
await sleep(1200);
await evalJs("(async () => { const m = await import('/js/store.js'); m.seedDemo(); return 'seeded'; })()");
await send('Page.navigate', { url: BASE + '/index.html#/stats?range=week' });
await sleep(1600);

const info = await evalJs("(() => { const btn = document.querySelector('#view [data-act=\"streak-card\"]'); if (!btn) return { err: 'no streak button', text: document.querySelector('#view').innerText.slice(0, 300) }; btn.click(); return { clicked: true }; })()");
await sleep(1200);

const shot = await evalJs("(() => { const c = document.querySelector('#streak-canvas'); if (!c) return { err: 'no canvas' }; return { url: c.toDataURL('image/png'), w: c.width, h: c.height }; })()");

if (shot.value && shot.value.url) {
  fs.writeFileSync(OUT, Buffer.from(shot.value.url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ ok: true, file: OUT, w: shot.value.w, h: shot.value.h, bytes: fs.statSync(OUT).size, errors: errors }, null, 1));
} else {
  console.log(JSON.stringify({ ok: false, info: info, shot: shot, errors: errors }, null, 1));
}

ws.close();
edge.kill();
server.close();
process.exit(0);
