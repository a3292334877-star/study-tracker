/* test14：v1.14 番茄循环（专注 / 短休 / 长休自动衔接）
   1) timer.js：getCycle / planNextPhase / restartCycle + settings 默认值
   2) 计时页：番茄循环开关与轮次显示
   3) 自动衔接：专注→短休→专注…第 4 轮后长休→回到第 1 轮（用假 Date.now 驱动）
   4) 版本：sw v22 / manifest 16(1.17) / me 页脚 v1.17
   用法：node _tools/test14.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8134 / 9375） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8134);
const DBG = Number(process.env.ST_DBG || 9375);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const timerSrc = read('js/timer.js');
const viewSrc = read('js/views/timer.js');
const storeSrc = read('js/store.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('timer.js 番茄循环函数',
  ['export function getCycle', 'export function planNextPhase', 'export function restartCycle']
    .every((k) => timerSrc.includes(k)) && timerSrc.includes('cycleRound'), true);
check('计时页番茄循环开关',
  viewSrc.includes('id="cycle-toggle"') && viewSrc.includes('id="cycle-sub"')
    && viewSrc.includes("setSetting('pomodoroCycle'") && viewSrc.includes('id="short-input"'), true);
check('store 设置默认值',
  storeSrc.includes('pomodoroCycle: false') && storeSrc.includes('pomodoroShortMin: 5')
    && storeSrc.includes('pomodoroLongMin: 15') && storeSrc.includes('pomodoroRounds: 4'), true);
check('版本：sw v22 / manifest 16-1.17 / 页脚 v1.17',
  swSrc.includes("const CACHE = 'study-tracker-v22';")
    && manifestXml.includes('android:versionCode="16"') && manifestXml.includes('android:versionName="1.17"')
    && meSrc.includes('学习记录 v1.17'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile14-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result14.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.kill(); edge.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; } if (m.method === 'Runtime.exceptionThrown') { logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description }; return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

/* ---------- 3. 纯函数单测 ---------- */
const plan = await evaluate("(async () => { const t = await import('./js/timer.js'); return { r1: t.planNextPhase({ mode: 'focus', round: 1, roundsPerLong: 4, focusMin: 25, shortMin: 5, longMin: 15 }), r4: t.planNextPhase({ mode: 'focus', round: 4, roundsPerLong: 4, focusMin: 25, shortMin: 5, longMin: 15 }), b1: t.planNextPhase({ mode: 'short', round: 1, roundsPerLong: 4, focusMin: 25, shortMin: 5, longMin: 15 }), b4: t.planNextPhase({ mode: 'long', round: 4, roundsPerLong: 4, focusMin: 25, shortMin: 5, longMin: 15 }) }; })()", true);
check('planNextPhase 阶段推进正确',
  plan && plan.r1.mode === 'short' && plan.r1.targetMin === 5 && plan.r1.round === 1
    && plan.r4.mode === 'long' && plan.r4.targetMin === 15
    && plan.b1.mode === 'focus' && plan.b1.round === 2 && plan.b1.targetMin === 25
    && plan.b4.mode === 'focus' && plan.b4.round === 1, plan);

const defs = await evaluate("(async () => { const t = await import('./js/timer.js'); const c = t.getCycle(); return { enabled: c.enabled, focus: c.focusMin, short: c.shortMin, long: c.longMin, rounds: c.roundsPerLong, round: c.round }; })()", true);
check('getCycle 默认值', defs && defs.enabled === false && defs.focus === 25 && defs.short === 5 && defs.long === 15 && defs.rounds === 4 && defs.round === 1, defs);

/* ---------- 4. 打开计时页，开启番茄循环 ---------- */
await evaluate('location.hash = "#/timer"; "ok"');
await sleep(700);
const toggle = await evaluate("(() => { const b = document.querySelector('#cycle-toggle'); if (!b) return { exists: false }; b.click(); return { exists: true, pressed: b.getAttribute('aria-pressed'), hint: document.querySelector('#timer-hint').textContent, main: document.querySelector('#btn-main').textContent }; })()");
await sleep(300);
const afterToggle = await evaluate("(() => { const b = document.querySelector('#cycle-toggle'); const seg = document.querySelector('#style-seg'); return { pressed: b && b.getAttribute('aria-pressed'), hint: document.querySelector('#timer-hint').textContent, sub: document.querySelector('#cycle-sub').textContent, segHidden: !seg || getComputedStyle(seg).display === 'none' }; })()");
check('开启番茄循环后的界面', afterToggle && afterToggle.pressed === 'true'
  && /第 1\/4 轮/.test(afterToggle.hint) && /番茄循环/.test(afterToggle.hint)
  && /专注 25/.test(afterToggle.sub) && afterToggle.segHidden === true, afterToggle);

/* ---------- 5. 假 Date.now 驱动自动衔接 ---------- */
await evaluate("window.__nowBase = Date.parse('2026-05-01T09:00:00Z'); window.__now = window.__nowBase; Date.now = () => window.__now; 'ok'");
await evaluate("document.querySelector('#btn-main').click(); 'ok'");
await sleep(400);
const startState = await evaluate("(async () => { const t = await import('./js/timer.js'); const s = t.getTimer(); return { mode: s.mode, status: s.status, target: s.targetMs / 60000, round: s.cycleRound }; })()", true);

// 第 1 轮专注到点 -> 短休
await evaluate("window.__now += 25 * 60000 + 1500; 'ok'");
await sleep(900);
const afterFocus1 = await evaluate("(async () => { const t = await import('./js/timer.js'); const st = await import('./js/store.js'); const s = t.getTimer(); const ss = st.getState().sessions; return { mode: s.mode, status: s.status, target: s.targetMs / 60000, round: s.cycleRound, logged: ss.length ? ss[ss.length - 1].minutes : 0 }; })()", true);
check('专注到点自动进入短休', startState && startState.mode === 'focus' && afterFocus1
  && afterFocus1.mode === 'short' && afterFocus1.status === 'running' && afterFocus1.target === 5
  && afterFocus1.round === 1 && afterFocus1.logged === 25, { startState, afterFocus1 });

// 短休结束 -> 第 2 轮专注
await evaluate("window.__now += 5 * 60000 + 1500; 'ok'");
await sleep(900);
const afterBreak1 = await evaluate("(async () => { const t = await import('./js/timer.js'); const s = t.getTimer(); const saved = JSON.parse(localStorage.getItem('study-tracker/timer') || '{}'); return { mode: s.mode, status: s.status, target: s.targetMs / 60000, round: s.cycleRound, savedRound: saved.cycleRound }; })()", true);
check('短休结束进入第 2 轮专注', afterBreak1 && afterBreak1.mode === 'focus' && afterBreak1.status === 'running'
  && afterBreak1.target === 25 && afterBreak1.round === 2 && afterBreak1.savedRound === 2, afterBreak1);

// 第 2、3 轮：专注->短休->专注
async function fullRound() {
  await evaluate("window.__now += 25 * 60000 + 1500; 'ok'"); await sleep(800);
  await evaluate("window.__now += 5 * 60000 + 1500; 'ok'"); await sleep(800);
}
await fullRound(); // completes round2 focus+short -> round3
await fullRound(); // completes round3 focus+short -> round4
const beforeLong = await evaluate("(async () => { const t = await import('./js/timer.js'); const s = t.getTimer(); return { mode: s.mode, round: s.cycleRound, target: s.targetMs / 60000 }; })()", true);
check('第 4 轮开始', beforeLong && beforeLong.mode === 'focus' && beforeLong.round === 4 && beforeLong.target === 25, beforeLong);

// 第 4 轮专注到点 -> 长休 15 分钟
await evaluate("window.__now += 25 * 60000 + 1500; 'ok'");
await sleep(900);
const afterFocus4 = await evaluate("(async () => { const t = await import('./js/timer.js'); const s = t.getTimer(); return { mode: s.mode, status: s.status, target: s.targetMs / 60000, round: s.cycleRound }; })()", true);
check('第 4 轮后进入长休', afterFocus4 && afterFocus4.mode === 'long' && afterFocus4.status === 'running'
  && afterFocus4.target === 15 && afterFocus4.round === 4, afterFocus4);

// 长休结束 -> 回到第 1 轮
await evaluate("window.__now += 15 * 60000 + 1500; 'ok'");
await sleep(900);
const afterLong = await evaluate("(async () => { const t = await import('./js/timer.js'); const s = t.getTimer(); return { mode: s.mode, status: s.status, target: s.targetMs / 60000, round: s.cycleRound }; })()", true);
check('长休结束回到第 1 轮', afterLong && afterLong.mode === 'focus' && afterLong.status === 'running'
  && afterLong.target === 25 && afterLong.round === 1, afterLong);

// 4 轮专注共记 100 分钟
const totals = await evaluate("(async () => { const st = await import('./js/store.js'); const ss = st.getState().sessions; const last4 = ss.slice(-4); return { n: ss.length, mins: last4.map(x => x.minutes), sum: last4.reduce((a, x) => a + x.minutes, 0) }; })()", true);
check('4 轮专注都记入 25 分钟', totals && totals.mins.filter((m) => m === 25).length === 4 && totals.sum === 100, totals);

/* ---------- 6. 更多选项：休息设置 ---------- */
await evaluate("document.querySelector('#btn-main').click(); 'ok'"); // 暂停
await sleep(200);
const sheetView = await evaluate("(() => { document.querySelector('#btn-more').click(); const s = document.querySelector('#sheet'); return { hasShort: !!s.querySelector('#short-input'), short: s.querySelector('#short-input') ? s.querySelector('#short-input').value : '', long: s.querySelector('#long-input') ? s.querySelector('#long-input').value : '', rounds: s.querySelector('#rounds-input') ? s.querySelector('#rounds-input').value : '' }; })()");
check('更多选项含番茄设置', sheetView && sheetView.hasShort && sheetView.short === '5' && sheetView.long === '15' && sheetView.rounds === '4', sheetView);

const savedSheet = await evaluate("(async () => { const s = document.querySelector('#sheet'); s.querySelector('#short-input').value = '7'; s.querySelector('[data-act=\"ok\"]').click(); const st = await import('./js/store.js'); const t = await import('./js/timer.js'); return { short: st.getState().settings.pomodoroShortMin, cycle: t.getCycle().shortMin }; })()", true);
check('休息设置保存生效', savedSheet && savedSheet.short === 7 && savedSheet.cycle === 7, savedSheet);

/* ---------- 7. 手动切正计时会关闭循环 ---------- */
const manualOff = await evaluate("(async () => { const b = document.querySelector('[data-style=\"up\"]'); if (b) b.click(); const t = await import('./js/timer.js'); const st = await import('./js/store.js'); return { enabled: t.getCycle().enabled, setting: st.getState().settings.pomodoroCycle, pressed: document.querySelector('#cycle-toggle').getAttribute('aria-pressed') }; })()", true);
check('手动切正计时关闭番茄循环', manualOff && manualOff.enabled === false && manualOff.setting === false && manualOff.pressed === 'false', manualOff);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));

/* ---------- 收尾 ---------- */
ws.close();
edge.kill();
server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result14.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);