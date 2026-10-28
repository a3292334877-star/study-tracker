import fs from 'node:fs';

let EXPR = process.argv[2] || '1+1';
if (EXPR.startsWith('@')) EXPR = fs.readFileSync(EXPR.slice(1), 'utf8');
const PORT = process.argv[3] || '9222';

const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
const page = list.find((t) => t.type === 'page');
if (!page) { console.error('NO-PAGE'); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});

await send('Runtime.enable');
/* 尝试给页面授予剪贴板权限，便于验证「复制」类功能（不支持时静默跳过） */
try {
  const origin = new URL(page.url).origin;
  await send('Browser.grantPermissions', {
    origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });
} catch (_) {}

try { await send('Page.enable'); await send('Page.bringToFront'); } catch (_) {}

const res = await send('Runtime.evaluate', {
  expression: EXPR,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true,
});
await new Promise((r) => setTimeout(r, 600));
console.log(JSON.stringify({ value: res.result?.value, desc: res.result?.description, logs }, null, 1));
ws.close();
