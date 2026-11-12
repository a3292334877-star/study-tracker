/* test24：v1.23 学习目标助手（科目周目标 + 每日配额 + 达成预测）
   静态：subjectGoalOverview / goalOverview 预测字段 / 目标页新结构 / 样式 / 版本
   数据：科目本周汇总、排序、needPerDay / projected / onTrack
   界面：预测文案、科目周目标行、打开科目目标弹层并保存、页脚
   用法：node _tools/test24.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8144 / 9385） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8144);
const DBG = Number(process.env.ST_DBG || 9385);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const goalsSrc = read('js/views/goals.js');
const goalsCss = read('css/parts/goals.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 目标助手 API',
  storeSrc.includes('export function subjectGoalOverview')
    && storeSrc.includes('m.needPerDay =')
    && storeSrc.includes('m.projected =')
    && storeSrc.includes('m.forecastGap =')
    && storeSrc.includes('m.onTrack ='), true);
check('目标页 v1.23 结构与样式',
  goalsSrc.includes('data-goal-pace')
    && goalsSrc.includes('data-subject-goal')
    && goalsSrc.includes('openSubjectGoalSheet')
    && goalsSrc.includes('subjectGoalOverview')
    && goalsCss.includes('.goal-pace')
    && goalsCss.includes('.goal-sub-row'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v34';")
    && manifestXml.includes('android:versionCode="28"') && manifestXml.includes('android:versionName="1.29"')
    && meSrc.includes('学习记录 v1.29'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile24-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result24.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); const now = Date.now(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444', goalMinWeek: 300 }); const eng = st.addSubject({ name: '英语', emoji: '📘', color: '#4f6df5' }); const add = (sub, days, min, title) => st.addSession({ subjectId: sub.id, end: now - days * 86400000, minutes: min, title }); const a = add(math, 0, 60, '今天'); const b = add(math, 1, 90, '昨天'); const c = add(math, 10, 120, '十天前'); const d = add(eng, 0, 30, '英语今天'); return { math: math.id, eng: eng.id, a: a.id, b: b.id, c: c.id, d: d.id }; })()", true);
check('种子：数学周目标 5h + 今日 60/昨日 90，英语今日 30', seed && seed.math && seed.eng && seed.a && seed.b && seed.c && seed.d, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const ov = st.goalOverview(); const sub = st.subjectGoalOverview(); const math = sub.rows.find((r) => r.id === '" + seed.math + "'); const eng = sub.rows.find((r) => r.id === '" + seed.eng + "'); return { rows: sub.rows.length, set: sub.set, met: sub.met, first: sub.rows[0] ? sub.rows[0].id : '', math: math, eng: eng, weekly: ov.weekly, daily: ov.daily, pace: ov.pace, targets: ov.targets }; })()", true);
check('科目周目标：数学本周 150 分钟 / 2 条 / 进度 50%', data && data.rows === 2 && data.math && data.math.min === 150 && data.math.count === 2 && data.math.goal === 300 && data.math.pct === 50 && data.math.met === false, data && data.math);
check('科目周目标：有目标排前面，英语未设目标', data && data.first === (seed && seed.math) && data.eng && data.eng.goal === 0 && data.eng.min === 30, data && { first: data.first, eng: data.eng });
check('goalOverview 预测字段齐全', data && typeof data.pace === 'number' && data.weekly && typeof data.weekly.needPerDay === 'number'
  && typeof data.weekly.projected === 'number' && typeof data.weekly.forecastGap === 'number' && typeof data.weekly.onTrack === 'boolean', data && data.weekly);
check('每周配额 = ceil(剩余 / 剩余天数)', data && data.weekly.needPerDay === Math.ceil(Math.max(0, data.weekly.remaining) / Math.max(1, data.weekly.daysLeft)), data && { need: data.weekly.needPerDay, rem: data.weekly.remaining, left: data.weekly.daysLeft });
check('预测不低于实际，缺口 = 目标 - 预测', data && data.weekly.projected >= data.weekly.actual && data.weekly.forecastGap === Math.max(0, data.weekly.target - data.weekly.projected), data && { projected: data.weekly.projected, actual: data.weekly.actual, gap: data.weekly.forecastGap });
check('每日配额 = 今日剩余', data && data.daily.needPerDay === data.daily.remaining, data && { need: data.daily.needPerDay, rem: data.daily.remaining });

await evaluate('location.hash = "#/goals"; "ok"');
await sleep(1100);
const page = await evaluate("(() => { const pace = document.querySelector('[data-goal-pace]'); const sec = document.querySelector('[data-subject-goals]'); const rows = document.querySelectorAll('[data-subject-goal]'); const summary = document.querySelector('[data-subject-goal-summary]'); const dailyCard = document.querySelector('[data-goal-card=\"dailyGoalMin\"]'); return { route: location.hash, pace: pace ? pace.textContent.trim() : '', hasSec: !!sec, rows: rows.length, summary: summary ? summary.textContent.trim() : '', daily: dailyCard ? dailyCard.textContent : '' }; })()");
check('目标页显示达成预测文案', page && page.route === '#/goals' && page.pace && (page.pace.indexOf('每天还需') >= 0 || page.pace.indexOf('已达成') >= 0 || page.pace.indexOf('设一个') >= 0), page);
check('目标页显示两个科目周目标行', page && page.hasSec && page.rows === 2 && page.summary === '0/1 达成', page);
check('每日目标卡显示今天还需', page && page.daily.indexOf('今天还需') >= 0, page && page.daily);

const rowText = await evaluate("(() => { const rows = Array.prototype.slice.call(document.querySelectorAll('[data-subject-goal]')); const m = rows.filter((r) => r.textContent.indexOf('数学') >= 0)[0]; return m ? m.textContent.replace(/\s+/g, ' ').trim() : ''; })()");
check('数学科目行显示 50% 与 2h30m / 5h', rowText.indexOf('50%') >= 0 && rowText.indexOf('2h30m') >= 0 && rowText.indexOf('5h') >= 0, rowText);

await evaluate("document.querySelectorAll('[data-subject-goal]')[0].click(); 'ok'");
await sleep(600);
const sheet = await evaluate("(() => { const inp = document.querySelector('#subject-goal-input'); return { has: !!inp, value: inp ? inp.value : '', hasOk: !!document.querySelector('[data-act=\"ok\"]') }; })()");
check('科目周目标弹层带当前 5 小时', sheet && sheet.has && sheet.value === '5' && sheet.hasOk, sheet);

await evaluate("document.querySelector('#subject-goal-input').value = '2'; document.querySelector('[data-act=\"ok\"]').click(); 'ok'");
await sleep(1300);
const saved = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const s = raw.subjects.filter((x) => x.name === '数学')[0]; const rows = Array.prototype.slice.call(document.querySelectorAll('[data-subject-goal]')); const m = rows.filter((r) => r.textContent.indexOf('数学') >= 0)[0]; const summary = document.querySelector('[data-subject-goal-summary]'); return { goal: s ? s.goalMinWeek : null, row: m ? m.textContent.replace(/\s+/g, ' ').trim() : '', summary: summary ? summary.textContent.trim() : '' }; })()");
check('改数学周目标为 2h 后保存并刷新', saved && saved.goal === 120 && saved.row.indexOf('100%') >= 0 && saved.summary === '1/1 达成', saved);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => ({ entry: !!document.querySelector('[data-act=\"goals\"]'), footer: document.body.innerText.indexOf('学习记录 v1.29') >= 0 }))()");
check('我的页有学习目标入口与 v1.24 页脚', me && me.entry && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result24.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
