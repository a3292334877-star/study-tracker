/* v1.28 截图：学习洞察（30 天 / 90 天全页） */
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
const userDir = path.join(OUT, '_profile-shot-v128');
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
const seeded = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  st.resetAll();
  const defs = [['高等数学','📐','#ef4444'],['数据结构','🧩','#8b5cf6'],['英语','📖','#3b82f6'],['算法竞赛','🏆','#f59e0b']];
  const subs = defs.map((x) => st.addSubject({ name: x[0], emoji: x[1], color: x[2] }));
  const titles = [['极限与连续错题','导数公式复习','积分换元练习','线代特征值'],['二叉树遍历','动态规划背包','图的最短路','排序算法复盘'],['阅读理解精读','听力精听','写作句型积累','单词复盘'],['二分答案专项','并查集练习','线段树入门','模拟赛复盘']];
  const tags = [['复习','错题'],['算法','练习'],['阅读','听力'],['竞赛','练习']];
  const at = (ago, hour) => { const d = new Date(); d.setDate(d.getDate() - ago); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  let n = 0;
  for (let ago = 0; ago < 88; ago += 1) {
    if (ago % 7 === 3) continue;
    const s = (ago * 3 + (ago % 5)) % 4;
    const hour = [9, 14, 16, 20, 22][(ago + s) % 5];
    const min = [25, 30, 45, 60, 90][(ago * 2 + s) % 5];
    st.addSession({ subjectId: subs[s].id, end: at(ago, hour), minutes: min, title: titles[s][ago % 4], tags: tags[s].slice(0, ago % 2 + 1) });
    n += 1;
    if (ago % 6 === 0) {
      const s2 = (s + 1) % 4;
      st.addSession({ subjectId: subs[s2].id, end: at(ago, (hour + 3) % 23), minutes: 30, title: titles[s2][(ago + 1) % 4], tags: tags[s2].slice(0, 1) });
      n += 1;
    }
  }
  return { records: n };
})()`, true);
await evaluate('location.hash = "#/insights?range=30"; "ok"');
await sleep(1200);
const h30 = await evaluate('document.documentElement.scrollHeight');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h30, 12000), deviceScaleFactor: 2, mobile: true });
await sleep(500);
await shot('v128-insights-30');
await evaluate('location.hash = "#/insights?range=90"; "ok"');
await sleep(1000);
const h90 = await evaluate('document.documentElement.scrollHeight');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h90, 12000), deviceScaleFactor: 2, mobile: true });
await sleep(500);
await shot('v128-insights-90');
console.log(JSON.stringify({ ok: true, seeded, h30, h90, out: OUT }));
ws.close(); edge.kill(); server.kill();
await sleep(300);
process.exit(0);
