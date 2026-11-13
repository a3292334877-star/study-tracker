/* test26：v1.25 目标达成日历
   静态：calendarYear 目标字段 / 日历目标视图 / 目标页入口 / 样式 / 版本
   数据：每日目标达标统计、每月达标天数
   界面：目标视图点亮达标日、学习量/目标切换、目标页入口
   用法：node _tools/test26.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8146 / 9387） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8146);
const DBG = Number(process.env.ST_DBG || 9387);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const calendarSrc = read('js/views/calendar.js');
const goalsSrc = read('js/views/goals.js');
const calendarCss = read('css/parts/calendar.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 日历目标 API',
  storeSrc.includes('goalMet: goalMin > 0 && bucket.min >= goalMin')
    && storeSrc.includes('let goalMetDays = 0;')
    && storeSrc.includes('m.metDays = m.days.filter((d) => d.goalMet).length;')
    && storeSrc.includes('goalMetDays,'), true);
check('日历目标视图结构',
  calendarSrc.includes("ctx.query.view === 'goal'")
    && calendarSrc.includes('data-cal-view="volume"')
    && calendarSrc.includes('data-cal-view="goal"')
    && calendarSrc.includes('goal-view')
    && calendarSrc.includes('is-goal-met')
    && calendarSrc.includes('cal-goal-stat'), true);
check('目标页有全年目标达成入口',
  goalsSrc.includes('data-act="goal-calendar"')
    && goalsSrc.includes('#/calendar?view=goal'), true);
check('目标日历样式',
  calendarCss.includes('.cal-months.goal-view')
    && calendarCss.includes('.cal-months.goal-view .cal-cell.is-goal-met')
    && calendarCss.includes('.cal-view-toggle')
    && calendarCss.includes('.cal-goal-stat'), true);
check('版本：sw v30 / manifest 24-1.25 / 页脚 v1.25',
  swSrc.includes("const CACHE = 'study-tracker-v41';")
    && manifestXml.includes('android:versionCode="35"') && manifestXml.includes('android:versionName="1.35"')
    && meSrc.includes('学习记录 v1.35'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile26-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result26.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); st.setGoal('dailyGoalMin', 60); const y = new Date().getFullYear(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const add = (day, min, title) => st.addSession({ subjectId: math.id, end: new Date(y, 2, day, 10, 0).getTime(), minutes: min, title }); add(1, 60, '达标一'); add(2, 90, '达标二'); add(3, 30, '未达标'); add(4, 120, '达标三'); return { id: math.id, year: y }; })()", true);
check('种子：每日目标 60 分钟 + 四天记录', seed && seed.id && seed.year > 2000, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const cal = st.calendarYear(" + (seed && seed.year) + "); const mar = cal.months[2]; const days = [1, 2, 3, 4].map((d) => { const x = mar.days.find((v) => v.day === d); return { day: x.day, minutes: x.minutes, goalMet: x.goalMet }; }); return { goalMin: cal.goalMin, goalMetDays: cal.goalMetDays, metDays: mar.metDays, monthTotal: mar.totalMin, days }; })()", true);
check('calendarYear 返回每日目标与达标天数', data && data.goalMin === 60 && data.goalMetDays === 3, data);
check('每日达标判定按分钟数', data && data.days[0].goalMet === true && data.days[1].goalMet === true && data.days[2].goalMet === false && data.days[3].goalMet === true, data && data.days);
check('三月达标 3 天且总时长 300 分钟', data && data.metDays === 3 && data.monthTotal === 300, data && { metDays: data.metDays, total: data.monthTotal });

await evaluate('location.hash = "#/calendar?year=' + seed.year + '&view=goal"; "ok"');
await sleep(1200);
const goalPage = await evaluate("(() => { const months = document.querySelector('.cal-months'); const facts = document.querySelector('#cal-facts'); const stat = document.querySelector('#cal-goal-stat'); const month = document.querySelectorAll('.cal-month')[2]; const total = month ? month.querySelector('.cal-month-total') : null; return { route: location.hash, goalView: !!months && months.classList.contains('goal-view'), met: document.querySelectorAll('.cal-cell.is-goal-met').length, miss: document.querySelectorAll('.cal-cell.is-goal-miss').length, facts: facts ? facts.innerText.replace(/\s+/g, ' ') : '', legend: !!document.querySelector('.cal-legend-goal'), march: total ? total.textContent.trim() : '', stat: stat ? stat.textContent.replace(/\s+/g, ' ').trim() : '' }; })()");
check('目标视图点亮 3 个达标日', goalPage && goalPage.route.indexOf('view=goal') >= 0 && goalPage.goalView === true && goalPage.met === 3 && goalPage.miss > 0, goalPage);
check('目标视图统计：目标达标与达标率', goalPage && goalPage.facts.indexOf('目标达标') >= 0 && goalPage.facts.indexOf('达标率') >= 0, goalPage && goalPage.facts);
check('三月格显示 3 天达标/图例/每日目标', goalPage && goalPage.march === '3 天' && goalPage.legend === true && goalPage.stat.indexOf('每日目标') >= 0 && goalPage.stat.indexOf('全年达标') >= 0, goalPage);

await evaluate('location.hash = "#/calendar?year=' + seed.year + '"; "ok"');
await sleep(1100);
const volumePage = await evaluate("(() => { const months = document.querySelector('.cal-months'); return { route: location.hash, goalView: !!months && months.classList.contains('goal-view'), lv: document.querySelectorAll('.cal-cell[class*=lv]').length, toggle: !!document.querySelector('[data-cal-view=goal]') }; })()");
check('学习量视图默认不显示目标态', volumePage && volumePage.goalView === false && volumePage.lv > 0 && volumePage.toggle === true, volumePage);

await evaluate("document.querySelector('[data-cal-view=goal]').click(); 'ok'");
await sleep(1100);
const toggled = await evaluate("(() => { const months = document.querySelector('.cal-months'); return { route: location.hash, goalView: !!months && months.classList.contains('goal-view'), met: document.querySelectorAll('.cal-cell.is-goal-met').length }; })()");
check('切换按钮进入目标视图', toggled && toggled.route.indexOf('view=goal') >= 0 && toggled.goalView === true && toggled.met === 3, toggled);

await evaluate("document.querySelector('[data-cal-view=volume]').click(); 'ok'");
await sleep(1000);
const back = await evaluate("(() => { const months = document.querySelector('.cal-months'); return { route: location.hash, goalView: !!months && months.classList.contains('goal-view') }; })()");
check('切换回学习量视图', back && back.route.indexOf('view=goal') < 0 && back.goalView === false, back);

await evaluate('location.hash = "#/goals"; "ok"');
await sleep(1100);
const goalsPage = await evaluate("(() => { const btn = document.querySelector('[data-act=goal-calendar]'); return { btn: !!btn, text: btn ? btn.textContent : '' }; })()");
check('目标页有全年目标达成按钮', goalsPage && goalsPage.btn === true && goalsPage.text.indexOf('全年目标达成') >= 0, goalsPage);
await evaluate("document.querySelector('[data-act=goal-calendar]').click(); 'ok'");
await sleep(1100);
const viaGoals = await evaluate("(() => { const months = document.querySelector('.cal-months'); return { route: location.hash, goalView: !!months && months.classList.contains('goal-view') }; })()");
check('从目标页进入目标日历', viaGoals && viaGoals.route.indexOf('#/calendar') >= 0 && viaGoals.route.indexOf('view=goal') >= 0 && viaGoals.goalView === true, viaGoals);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => ({ footer: document.body.innerText.indexOf('学习记录 v1.35') >= 0 }))()");
check('我的页 v1.25 页脚', me && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result26.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
