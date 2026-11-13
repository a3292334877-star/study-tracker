/* test32：v1.30.1 批量操作条只在选择模式出现
   静态：CSS [hidden] 修复、HTML 默认 hidden、JS 按 selectMode 切换
   界面：记录页初始不显示批量条，点「批量」才出现，勾选计数，完成后隐藏
   用法：node _tools/test32.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8153 / 9394） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8153);
const DBG = Number(process.env.ST_DBG || 9394);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const logSrc = read('js/views/log.js');
const logCss = read('css/parts/log.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('批量条 hidden 的 CSS 修复已落地',
  logCss.includes('.batch-bar[hidden]{display:none}'), true);
check('批量条默认 hidden 且由 selectMode 控制',
  logSrc.includes('id="batch-bar" hidden') && logSrc.includes('batchBar.hidden = !selectMode'), true);
check('版本：sw v36 / manifest 30-1.30.1 / 页脚 v1.30.1',
  swSrc.includes("const CACHE = 'study-tracker-v37';")
    && manifestXml.includes('android:versionCode="31"')
    && manifestXml.includes('android:versionName="1.31"')
    && meSrc.includes('学习记录 v1.31'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile32-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result32.json'), JSON.stringify({ results }, null, 2));
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

await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const s = st.addSubject({ name: '批量测试' }); const t = Date.now(); st.addSession({ subjectId: s.id, end: t, minutes: 20, title: '第一条' }); st.addSession({ subjectId: s.id, end: t - 3600000, minutes: 30, title: '第二条' }); return st.getState().sessions.length; })()",
  true
);
await evaluate('location.hash = "#/log"; "ok"');
await sleep(1200);
const initial = await evaluate("(() => { const bar = document.querySelector('#batch-bar'); const body = document.querySelector('#log-body'); return { bar: Boolean(bar), hidden: bar && bar.hidden, display: bar ? getComputedStyle(bar).display : '', selecting: Boolean(body && body.classList.contains('selecting')), rows: document.querySelectorAll('[data-session]').length }; })()");
check('记录页初始不显示批量操作条', initial && initial.bar && initial.hidden === true && initial.display === 'none' && !initial.selecting && initial.rows >= 2, initial);

await evaluate("document.querySelector('#log-batch').click(); 'ok'");
await sleep(500);
const entered = await evaluate("(() => { const bar = document.querySelector('#batch-bar'); const body = document.querySelector('#log-body'); return { hidden: bar.hidden, display: getComputedStyle(bar).display, selecting: body.classList.contains('selecting'), count: document.querySelector('#batch-count').textContent.trim() }; })()");
check('点「批量」后才显示操作条', entered && entered.hidden === false && entered.display === 'flex' && entered.selecting && entered.count.indexOf('已选 0 条') >= 0, entered);

const pick = await evaluate("(() => { const row = document.querySelector('[data-session]'); row.click(); return { picked: row.classList.contains('picked'), count: document.querySelector('#batch-count').textContent.trim() }; })()");
check('选择记录后计数更新', pick && pick.picked && pick.count.indexOf('已选 1 条') >= 0, pick);

await evaluate("document.querySelector('#batch-done').click(); 'ok'");
await sleep(400);
const done = await evaluate("(() => { const bar = document.querySelector('#batch-bar'); const body = document.querySelector('#log-body'); return { hidden: bar.hidden, display: getComputedStyle(bar).display, selecting: body.classList.contains('selecting') }; })()");
check('点「完成」后操作条隐藏', done && done.hidden === true && done.display === 'none' && !done.selecting, done);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result32.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
