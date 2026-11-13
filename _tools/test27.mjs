/* test27：v1.26 月度报告
   静态：monthSummary / monthly 视图 / 统计页入口 / 月报海报 / 路由 / 样式 / 版本
   数据：monthSummary 月份累计、达标天数、最长连续、最佳单日、科目与标签
   界面：月份导航、日历热力与达标框、统计页入口、月度海报
   用法：node _tools/test27.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8147 / 9388） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8147);
const DBG = Number(process.env.ST_DBG || 9388);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const monthlySrc = read('js/views/monthly.js');
const statsSrc = read('js/views/stats.js');
const reportSrc = read('js/report.js');
const monthlyCss = read('css/parts/monthly.css');
const appSrc = read('js/app.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 月度汇总 API',
  storeSrc.includes('export function monthSummary')
    && storeSrc.includes('prevDeltaPct')
    && storeSrc.includes('goalMetDays')
    && storeSrc.includes('peakHour')
    && storeSrc.includes('bestDay')
    && storeSrc.includes('monthGoalPct'), true);
check('月度报告视图结构',
  monthlySrc.includes('export function renderMonthly')
    && monthlySrc.includes('export function monthlyText')
    && monthlySrc.includes('data-month-step')
    && monthlySrc.includes('month-grid')
    && monthlySrc.includes('is-goal-met')
    && monthlySrc.includes('month-canvas')
    && monthlySrc.includes('data-act="month-poster"'), true);
check('统计页有月度报告入口',
  statsSrc.includes('data-act="month-report"')
    && statsSrc.includes('#/monthly?year='), true);
check('月度海报绘制函数',
  reportSrc.includes('export function drawMonthPoster')
    && reportSrc.includes('本月日历')
    && reportSrc.includes('科目排行'), true);
check('app 注册 monthly 路由',
  appSrc.includes("import { renderMonthly }") && appSrc.includes('monthly: renderMonthly'), true);
check('月度报告样式',
  monthlyCss.includes('.month-grid')
    && monthlyCss.includes('.month-cell.lv4')
    && monthlyCss.includes('.is-goal-met')
    && monthlyCss.includes('.month-tags'), true);
check('版本：sw v34 / manifest 28-1.29 / 页脚 v1.30',
  swSrc.includes("const CACHE = 'study-tracker-v44';")
    && manifestXml.includes('android:versionCode="38"') && manifestXml.includes('android:versionName="1.38"')
    && meSrc.includes('学习记录 v1.38'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile27-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result27.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); st.setGoal('dailyGoalMin', 60); st.setGoal('monthlyGoalMin', 600); const b = new Date(); b.setDate(1); b.setMonth(b.getMonth() - 1); const y = b.getFullYear(); const m = b.getMonth(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const eng = st.addSubject({ name: '英语', emoji: '📖', color: '#3b82f6' }); const add = (day, min, subj, title, tags) => st.addSession({ subjectId: subj.id, end: new Date(y, m, day, 10, 0).getTime(), minutes: min, title: title, tags: tags }); add(1, 60, math, '达标一', ['复习']); add(2, 90, math, '达标二', ['复习']); add(3, 30, eng, '未达标', ['背单词']); add(4, 120, math, '达标三', ['刷题']); return { year: y, month: m }; })()",
  true
);
check('种子：上月 4 条记录 + 日/月目标', seed && seed.year > 2000 && seed.month >= 0 && seed.month <= 11, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const d = st.monthSummary(" + seed.year + ", " + seed.month + "); return { label: d.label, total: d.totalMin, count: d.count, activeDays: d.activeDays, goalMetDays: d.goalMetDays, longest: d.longest, best: d.bestDay ? d.bestDay.min : 0, subs: d.subjects.map((s) => s.name), tags: d.tags.map((t) => t.name), dim: d.dim, lv4: d.byDay.filter((x) => x.level === 4).length }; })()", true);
check('monthSummary 月份累计与记录数', data && data.total === 300 && data.count === 4 && data.activeDays === 4, data);
check('monthSummary 达标天数与最长连续', data && data.goalMetDays === 3 && data.longest === 4, data && { goalMetDays: data.goalMetDays, longest: data.longest });
check('monthSummary 最佳单日与科目排序', data && data.best === 120 && data.subs[0] === '数学' && data.subs[1] === '英语', data && { best: data.best, subs: data.subs });
check('monthSummary 标签统计', data && data.tags.indexOf('复习') >= 0 && data.tags.indexOf('刷题') >= 0, data && data.tags);

await evaluate('location.hash = "#/monthly?year=' + seed.year + '&month=' + (seed.month + 1) + '"; "ok"');
await sleep(1200);
const page = await evaluate("(() => { const label = document.querySelector('#month-label'); const total = document.querySelector('#month-total'); return { route: location.hash, label: label ? label.textContent.trim() : '', total: total ? total.textContent.replace(/\\s+/g, '') : '', cells: document.querySelectorAll('#month-grid .month-cell').length, days: document.querySelectorAll('#month-grid .month-cell[data-day]').length, met: document.querySelectorAll('.month-cell.is-goal-met').length, lv: document.querySelectorAll('.month-cell[class*=lv]').length, stats: document.querySelectorAll('.stat-grid .stat').length, subs: document.querySelectorAll('#month-subjects .bar-line').length, tags: document.querySelectorAll('#month-tags .month-tag').length, miles: document.querySelectorAll('#month-miles .mile').length }; })()");
check('月度报告页面渲染总量与标签', page && page.route.indexOf('#/monthly') >= 0 && page.label.indexOf(seed.year + '年') >= 0 && page.label.indexOf((seed.month + 1) + '月') >= 0, page);
check('月度日历热力与达标框', page && page.days >= 28 && page.met === 3 && page.lv >= 28 && page.stats === 3, page);
check('科目排行/标签/小结渲染', page && page.subs === 2 && page.tags >= 1 && page.miles === 4, page);

await evaluate("document.querySelector('[data-month-step=\"-1\"]').click(); 'ok'");
await sleep(1000);
const prevPage = await evaluate("(() => ({ route: location.hash, label: document.querySelector('#month-label') ? document.querySelector('#month-label').textContent.trim() : '' }))()");
check('上一月导航切换', prevPage && prevPage.route !== page.route && prevPage.label !== page.label, { before: page.route, after: prevPage.route });
await evaluate("document.querySelector('[data-month-step=\"1\"]').click(); 'ok'");
await sleep(1000);
const backPage = await evaluate("(() => ({ route: location.hash, label: document.querySelector('#month-label') ? document.querySelector('#month-label').textContent.trim() : '' }))()");
check('下一月导航回到原月份', backPage && backPage.route === page.route && backPage.label === page.label, { want: page.route, got: backPage.route });

await evaluate('location.hash = "#/stats"; "ok"');
await sleep(1100);
const statsEntry = await evaluate("(() => { const btn = document.querySelector('[data-act=month-report]'); return { btn: !!btn, text: btn ? btn.textContent : '' }; })()");
check('统计页有查看月度报告按钮', statsEntry && statsEntry.btn === true && statsEntry.text.indexOf('查看月度报告') >= 0, statsEntry);
await evaluate("document.querySelector('[data-act=month-report]').click(); 'ok'");
await sleep(1100);
const viaStats = await evaluate("(() => ({ route: location.hash, hasGrid: !!document.querySelector('#month-grid') }))()");
check('从统计页进入月度报告', viaStats && viaStats.route.indexOf('#/monthly') >= 0 && viaStats.hasGrid === true, viaStats);

await evaluate("document.querySelector('[data-act=month-poster]').click(); 'ok'");
await sleep(900);
const poster = await evaluate("(() => { const c = document.querySelector('#month-canvas'); if (!c) return { ok: false }; const t = document.querySelector('.sheet-title'); return { ok: true, w: c.width, h: c.height, len: c.toDataURL('image/png').length, title: t ? t.textContent : '' }; })()");
check('月度海报弹层生成画布', poster && poster.ok === true && poster.w === 1500 && poster.h > 1200 && poster.len > 10000, poster && { w: poster.w, h: poster.h, len: poster.len });
check('月度海报标题', poster && poster.title.indexOf('学习月报') >= 0, poster && poster.title);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => ({ footer: document.body.innerText.indexOf('学习记录 v1.38') >= 0 }))()");
check('我的页 v1.30 页脚', me && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result27.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
