/* test23：v1.23 学习目标中心
   静态：store 目标 API / settings 默认、#/goals 路由、首页与我的入口、样式与 sw 资产、版本
   数据：每日/每周/每月口径、目标默认值与 setGoal、12 周历史与 84 格热力
   界面：首页入口、目标页卡片/周列表/热力、目标设置弹层保存、我的入口与页脚
   用法：node _tools/test23.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8143 / 9384） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8143);
const DBG = Number(process.env.ST_DBG || 9384);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const storeSrc = read('js/store.js');
const appSrc = read('js/app.js');
const homeSrc = read('js/views/home.js');
const meSrc = read('js/views/me.js');
const goalsSrc = read('js/views/goals.js');
const goalsCss = read('css/parts/goals.css');
const indexHtml = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 学习目标 API 与 settings 默认值',
  storeSrc.includes('weeklyGoalMin: 600')
    && storeSrc.includes('monthlyGoalMin: 2400')
    && storeSrc.includes('export const GOAL_LIMITS')
    && storeSrc.includes('export function goalTargets')
    && storeSrc.includes('export function setGoal')
    && storeSrc.includes('export function goalOverview')
    && storeSrc.includes('export function goalHistory')
    && storeSrc.includes('export function dailyGoalHistory'), true);
check('目标视图 / 路由 / 首页与我的入口',
  exists('js/views/goals.js')
    && goalsSrc.includes('export function renderGoals')
    && appSrc.includes("import { renderGoals } from './views/goals.js'")
    && appSrc.includes('goals: renderGoals')
    && homeSrc.includes('data-go-goals')
    && meSrc.includes('data-act="goals"'), true);
check('样式与 SW 资产登记',
  goalsCss.includes('.goal-card') && goalsCss.includes('.goal-heat')
    && indexHtml.includes('css/parts/goals.css')
    && swSrc.includes("./css/parts/goals.css")
    && swSrc.includes("./js/views/goals.js"), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v32';")
    && manifestXml.includes('android:versionCode="26"') && manifestXml.includes('android:versionName="1.27"')
    && meSrc.includes('学习记录 v1.27'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile23-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result23.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); const now = Date.now(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const add = (days, min, title) => st.addSession({ subjectId: math.id, end: now - days * 86400000, minutes: min, title }); const a = add(0, 60, '今天'); const b = add(1, 90, '昨天'); const c = add(10, 120, '十天前'); const d = add(40, 200, '四十天前'); return { math: math.id, a: a.id, b: b.id, c: c.id, d: d.id }; })()", true);
check('种子：今日 60 / 昨日 90 / 10 天前 120 / 40 天前 200', seed && seed.math && seed.a && seed.b && seed.c && seed.d, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const ov = st.goalOverview(); const t = st.goalTargets(); const hist = st.goalHistory(12); const dh = st.dailyGoalHistory(12); const wk = st.rangeSummary(ov.weekly.startKey, ov.weekly.endKey).minutes; const mo = st.rangeSummary(ov.monthly.startKey, ov.monthly.endKey).minutes; const set = st.setGoal('weeklyGoalMin', 300); const after = st.getState().settings.weeklyGoalMin; const bad = st.setGoal('nope', 123); return { daily: ov.daily.actual, weekly: ov.weekly.actual, wk: wk, monthly: ov.monthly.actual, mo: mo, targets: t, histLen: hist.length, lastCurrent: hist[hist.length - 1].current, cells: dh.cells.length, dhTarget: dh.target, set: set, after: after, bad: bad }; })()", true);
check('今日目标按今日记录计算', data && data.daily === 60, data);
check('本周 / 本月目标与 rangeSummary 口径一致', data && data.weekly === data.wk && data.monthly === data.mo, data);
check('默认目标 120 / 600 / 2400', data && data.targets.daily === 120 && data.targets.weekly === 600 && data.targets.monthly === 2400, data && data.targets);
check('setGoal 生效且非法 key 返回 null', data && data.set === 300 && data.after === 300 && data.bad === null, data);
check('12 周历史与 84 格每日热力', data && data.histLen === 12 && data.lastCurrent === true && data.cells === 84 && data.dhTarget === 120, data);

await evaluate('location.hash = "#/home"; "ok"');
await sleep(900);
const home = await evaluate("(() => { const row = document.querySelector('[data-go-goals]'); return { found: !!row, sub: row ? row.querySelector('.row-sub').textContent.trim() : '', val: row ? row.querySelector('.row-val').textContent.trim() : '' }; })()");
check('首页本周目标入口显示进度', home && home.found && home.sub.indexOf('/') >= 0 && /%$/.test(home.val), home);

await evaluate("document.querySelector('[data-go-goals]').click(); 'ok'");
await sleep(1000);
const page = await evaluate("(() => { const hero = document.querySelector('[data-goal-weekly-pct]'); return { route: location.hash, hero: hero ? hero.textContent.trim() : '', cards: document.querySelectorAll('.goal-card').length, weeks: document.querySelectorAll('[data-goal-week]').length, days: document.querySelectorAll('[data-day]').length, title: document.querySelector('#page-title').textContent.trim() }; })()");
check('目标页：本周进度、2 张目标卡、12 周列表、84 格热力',
  page && page.route === '#/goals' && /^\d+$/.test(page.hero) && page.cards === 2 && page.weeks === 12 && page.days === 84 && page.title === '学习目标', page);

await evaluate("document.querySelector('[data-goal-set=\"weeklyGoalMin\"]').click(); 'ok'");
await sleep(600);
const sheet = await evaluate("(() => { const inp = document.querySelector('#goal-input'); const before = inp ? inp.value : ''; if (inp) inp.value = '8'; return { hasInput: !!inp, before: before, hasOk: !!document.querySelector('[data-act=\"ok\"]') }; })()");
check('目标设置弹层打开并带当前值', sheet && sheet.hasInput && sheet.hasOk, sheet);

await evaluate("document.querySelector('[data-act=\"ok\"]').click(); 'ok'");
await sleep(1200);
const saved = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const row = Array.prototype.slice.call(document.querySelectorAll('[data-goal-set]')).filter((x) => x.dataset.goalSet === 'weeklyGoalMin')[0]; const hero = document.querySelector('[data-goal-weekly-pct]'); return { weekly: raw.settings.weeklyGoalMin, row: row ? row.querySelector('.row-val').textContent.trim() : '', hero: hero ? hero.textContent.trim() : '' }; })()");
check('改每周目标为 8 小时并刷新', saved && saved.weekly === 480 && saved.row.indexOf('8 小时') >= 0 && /^\d+$/.test(saved.hero), saved);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => ({ entry: !!document.querySelector('[data-act=\"goals\"]'), footer: document.body.innerText.indexOf('学习记录 v1.27') >= 0 }))()");
check('我的页有学习目标入口与 v1.24 页脚', me && me.entry && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result23.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
