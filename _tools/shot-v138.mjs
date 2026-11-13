/* v1.38 截图：统计页科目 / 标签分布下钻 + 记录页 URL 筛选结果 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8167);
const DBG = Number(process.env.ST_DBG || 9408);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); });
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, '_tools', 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(500);
const userDir = path.join(OUT, '_profile-shot-v138');
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
  + ' const en = st.addSubject({ name: "英语", emoji: "📖", color: "#0ea5e9" });'
  + ' const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();'
  + ' const ts = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 20, 0, 0, 0).getTime();'
  + ' const add = (title, minutes, dt, sid, tags) => st.addSession({ subjectId: sid, title: title, minutes: minutes, end: ts(dt), tags: tags });'
  + ' add("高数：多元函数微分", 50, now, math.id, ["高数", "重点"]);'
  + ' add("背单词 Unit 12", 25, new Date(y, m, now.getDate() - 3), en.id, ["英语"]);'
  + ' add("上月：概率论复习", 40, new Date(y, m - 1, 15), math.id, ["概率"]);'
  + ' add("上月：英语听力精听", 30, new Date(y, m - 1, 8), en.id, ["听力"]);'
  + ' add("两月前：线性代数", 35, new Date(y, m - 2, 10), math.id, ["线代"]);'
  + ' const from = st.dateKey(new Date(y, m - 2, 1)); return { today: st.dateKey(now), from };'
  + '})()', true);
await evaluate('location.hash = "#/stats?range=custom&from=' + seed.from + '&to=' + seed.today + '"; "ok"');
await sleep(1400);
await evaluate('(function(){ const c = Array.from(document.querySelectorAll("#view .card")).find(function(x){ return x.textContent.indexOf("科目分布") >= 0; }); if (c) { c.scrollIntoView({ block: "start" }); window.scrollBy(0, -92); } return "ok"; })()');
await sleep(400);
await shot('v138-stats-subjects');
await evaluate('(function(){ const c = Array.from(document.querySelectorAll("#view .card")).find(function(x){ return x.textContent.indexOf("标签分布") >= 0; }); if (c) { c.scrollIntoView({ block: "start" }); window.scrollBy(0, -92); } return "ok"; })()');
await sleep(400);
await shot('v138-stats-tags');
await evaluate('(function(){ const b = document.querySelector("[data-drill-subject]"); b.click(); return "ok"; })()');
await sleep(1000);
await evaluate('window.scrollTo(0, 0); "ok"');
await sleep(300);
const drill = await evaluate('(function(){ return { hash: location.hash, count: document.querySelector("#log-count").textContent.trim() }; })()');
await shot('v138-log-subject');
await evaluate('location.hash = "#/stats?range=custom&from=' + seed.from + '&to=' + seed.today + '"; "ok"');
await sleep(1200);
await evaluate('(function(){ const c = Array.from(document.querySelectorAll("#view .card")).find(function(x){ return x.textContent.indexOf("标签分布") >= 0; }); if (c) c.scrollIntoView({ block: "start" }); return "ok"; })()');
await sleep(300);
await evaluate('(function(){ const b = document.querySelector("[data-drill-tag]"); b.click(); return "ok"; })()');
await sleep(1000);
await evaluate('window.scrollTo(0, 0); "ok"');
await sleep(300);
const drillTag = await evaluate('(function(){ return { hash: location.hash, count: document.querySelector("#log-count").textContent.trim() }; })()');
await shot('v138-log-tag');
console.log(JSON.stringify({ ok: true, seed, drill, drillTag }));
ws.close(); edge.kill(); server.kill();
await sleep(300);
process.exit(0);
