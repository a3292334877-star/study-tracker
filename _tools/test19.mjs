/* test19：v1.19 智能计划（重复任务 + 复制上周计划）
   静态：store 重复任务函数 / plan 视图与样式 / 版本资源
   数据：daily / weekdays / weekly 投影、按天勾选、单日跳过、删除系列、复制上周
   界面：计划页重复徽章、添加重复任务、勾选单日、跳过单日、删除系列、复制上周
   用法：node _tools/test19.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8139 / 9380） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8139);
const DBG = Number(process.env.ST_DBG || 9380);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const planSrc = read('js/views/plan.js');
const planCss = read('css/parts/plan.css');
const homeSrc = read('js/views/home.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 重复任务函数与字段',
  storeSrc.includes('export function normRepeat')
    && storeSrc.includes('export function repeatLabel')
    && storeSrc.includes('export function copyWeekTodos')
    && storeSrc.includes('export function removeTodoSeries')
    && storeSrc.includes('doneDates') && storeSrc.includes('skipDates')
    && storeSrc.includes('repeatMatches'), true);
check('计划页重复任务与复制上周 UI',
  planSrc.includes('data-repeat') && planSrc.includes('data-act="copy-last"')
    && planSrc.includes('openRepeatDeleteSheet') && planSrc.includes('plan-repeat')
    && homeSrc.includes('repeatLabel'), true);
check('计划重复任务样式', planCss.includes('.plan-repeat') && planCss.includes('.hero-links'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v44';")
    && manifestXml.includes('android:versionCode="38"') && manifestXml.includes('android:versionName="1.38"')
    && meSrc.includes('学习记录 v1.38'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile19-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result19.json'), JSON.stringify({ results }, null, 2));
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

const dates = await evaluate("(async () => { const u = await import('./js/util.js'); const ws = u.startOfWeek(new Date(), 1); const keys = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, i))); const prev = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, -7 + i))); const next = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, 7 + i))); return { monday: keys[0], keys, prev, next }; })()", true);
check('日期环境（本周一与 7 天键）', dates && dates.keys.length === 7 && dates.monday === dates.keys[0], dates);
await evaluate('window.__D = ' + JSON.stringify(dates) + '; "ok"');

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; st.resetAll(); const daily = st.addTodo('每日阅读', D.monday, 'daily'); const weekdays = st.addTodo('工作日复盘', D.monday, 'weekdays'); const weekly = st.addTodo('每周总结', D.monday, 'weekly'); const a = st.addTodo('上周任务A', D.prev[0]); const b = st.addTodo('上周任务B', D.prev[1]); return { daily: daily.id, weekdays: weekdays.id, weekly: weekly.id, a: a.id, b: b.id, count: st.getState().todos.length }; })()", true);
check('种子任务写入', seed && seed.count === 5 && seed.daily && seed.weekdays && seed.weekly, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; const get = (key) => st.todosOfDay(key).map((t) => t.text); const daily = st.getState().todos.find((t) => t.text === '每日阅读'); const toggled = (() => { st.toggleTodo(daily.id, D.keys[1]); return { tue: st.todosOfDay(D.keys[1]).find((t) => t.text === '每日阅读').done, mon: st.todosOfDay(D.keys[0]).find((t) => t.text === '每日阅读').done, doneDates: daily.doneDates.slice() }; })(); st.removeTodo(daily.id, D.keys[2]); const skipped = { wed: st.todosOfDay(D.keys[2]).map((t) => t.text), thu: st.todosOfDay(D.keys[3]).map((t) => t.text), still: st.getState().todos.some((t) => t.id === daily.id), skipDates: daily.skipDates.slice() }; const weekly = st.getState().todos.find((t) => t.text === '每周总结'); const weeklyMon = get(D.keys[0]); st.removeTodoSeries(weekly.id); const series = { exists: st.getState().todos.some((t) => t.text === '每周总结'), nextMon: st.todosOfDay(D.next[0]).map((t) => t.text) }; const n1 = st.copyWeekTodos(D.prev[0], D.monday); const n2 = st.copyWeekTodos(D.prev[0], D.monday); const copied = { n1, n2, mon: st.todosOfDay(D.keys[0]).map((t) => t.text), tue: st.todosOfDay(D.keys[1]).map((t) => t.text), total: st.getState().todos.length }; const w = st.planWeek(D.monday); return { mon: get(D.keys[0]), tue: get(D.keys[1]), sat: get(D.keys[5]), prevMon: get(D.prev[0]), nextMon: get(D.next[0]), weeklyMon, toggled, skipped, series, copied, planTotal: w.total, planDays: w.days.map((d) => d.total) }; })()", true);
check('重复任务按规则投影到日期',
  data && data.weeklyMon.includes('每周总结') && data.mon.includes('每日阅读') && data.mon.includes('工作日复盘')
    && data.tue.includes('每日阅读') && data.tue.includes('工作日复盘') && !data.tue.includes('每周总结')
    && data.sat.includes('每日阅读') && !data.sat.includes('工作日复盘')
    && data.prevMon.includes('上周任务A') && !data.prevMon.includes('每日阅读')
    && data.nextMon.includes('每日阅读') && data.nextMon.includes('工作日复盘') && !data.nextMon.includes('每周总结'), data);
check('planWeek 将重复任务摊到 7 天（7+5+1=13）',
  data && data.planTotal === 13 && JSON.stringify(data.planDays) === JSON.stringify([3,3,1,2,2,1,1]), data && { total: data.planTotal, days: data.planDays });
check('重复任务按天勾选（只影响当天）',
  data && data.toggled.tue === true && data.toggled.mon === false && JSON.stringify(data.toggled.doneDates) === JSON.stringify([dates.keys[1]]), data && data.toggled);
check('重复任务单日跳过不删系列',
  data && !data.skipped.wed.includes('每日阅读') && data.skipped.thu.includes('每日阅读')
    && data.skipped.still === true && JSON.stringify(data.skipped.skipDates) === JSON.stringify([dates.keys[2]]), data && data.skipped);
check('删除整个重复系列',
  data && data.series.exists === false && !data.series.nextMon.includes('每周总结'), data && data.series);
check('复制上周任务（按星期几复制且去重）',
  data && data.copied.n1 === 2 && data.copied.n2 === 0
    && data.copied.mon.includes('上周任务A') && data.copied.tue.includes('上周任务B')
    && data.copied.total === 6, data && data.copied);

await evaluate('location.hash = "#/plan"; "ok"');
await sleep(800);
const page = await evaluate("(() => { const rows = Array.from(document.querySelectorAll('[data-plan-task]')); return { count: rows.length, badges: rows.map((r) => r.querySelector('.plan-repeat') ? r.querySelector('.plan-repeat').textContent.trim() : ''), dailyDays: Array.from(document.querySelectorAll('.plan-day')).filter((d) => Array.from(d.querySelectorAll('[data-plan-task]')).some((r) => r.querySelector('.plan-text').textContent.trim() === '每日阅读')).length, copyBtn: !!document.querySelector('[data-act=\"copy-last\"]') }; })()");
check('计划页显示重复任务徽章且每日任务跨 7 天',
  page && page.count === 13 && page.copyBtn && page.dailyDays === 6
    && page.badges.filter((b) => b === '每天').length === 6
    && page.badges.filter((b) => b === '工作日').length === 5
    && page.badges.filter((b) => b === '每周').length === 0, page);

const addDay = dates.keys[2];
await evaluate('document.querySelector(\'[data-add-day="' + addDay + '"]\').click(); "ok"');
await sleep(500);
const addSheet = await evaluate("({ hasInput: !!document.querySelector('#prompt-input'), chips: Array.from(document.querySelectorAll('#sheet [data-repeat]')).map((b) => b.textContent.trim()), hasDesc: !!document.querySelector('.sheet-desc') })");
await evaluate("(() => { document.querySelector('#sheet [data-repeat=\"daily\"]').click(); const inp = document.querySelector('#prompt-input'); inp.value = '界面每日任务'; document.querySelector('[data-act=\"yes\"]').click(); return 'ok'; })()");
await sleep(900);
const afterAdd = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '界面每日任务'); const days = Array.from(document.querySelectorAll('.plan-day')).filter((d) => Array.from(d.querySelectorAll('.plan-text')).some((x) => x.textContent.trim() === '界面每日任务')).length; return { repeat: t && t.repeat, date: t && t.date, days, sheetGone: !document.querySelector('#prompt-input') }; })()");
check('计划页添加每天重复任务',
  addSheet && addSheet.hasInput && addSheet.hasDesc && addSheet.chips.length === 4
    && afterAdd && afterAdd.repeat === 'daily' && afterAdd.date === addDay && afterAdd.days === 5 && afterAdd.sheetGone, { addSheet, afterAdd });

const clickToggle = await evaluate("(() => { const day = document.querySelector('[data-plan-day=\"' + window.__D.keys[0] + '\"]'); const row = day && Array.from(day.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '工作日复盘'); if (!row) return { found: false }; row.querySelector('[data-act=\"toggle-plan\"]').click(); return { found: true }; })()");
await sleep(800);
const afterUiToggle = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '工作日复盘'); const row = Array.from(document.querySelectorAll('[data-plan-day=\"' + window.__D.keys[0] + '\"] [data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '工作日复盘'); return { doneDates: t && t.doneDates, rowDone: row ? row.classList.contains('done') : null }; })()");
check('计划页勾选重复任务只写当天完成状态',
  clickToggle && clickToggle.found && afterUiToggle && afterUiToggle.rowDone === true
    && Array.isArray(afterUiToggle.doneDates) && afterUiToggle.doneDates.includes(dates.keys[0]) && afterUiToggle.doneDates.length === 1, afterUiToggle);

const delClick = await evaluate("(() => { const day = document.querySelector('[data-plan-day=\"' + window.__D.keys[3] + '\"]'); const row = day && Array.from(day.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '每日阅读'); if (!row) return { found: false }; row.querySelector('[data-act=\"del-plan\"]').click(); return { found: true }; })()");
await sleep(500);
const delSheet = await evaluate("({ title: document.querySelector('.sheet-title') ? document.querySelector('.sheet-title').textContent.trim() : '', desc: document.querySelector('.sheet-desc') ? document.querySelector('.sheet-desc').textContent : '', buttons: Array.from(document.querySelectorAll('.sheet-actions [data-act]')).map((b) => b.dataset.act) })");
await evaluate('document.querySelector(\'[data-act="skip"]\').click(); "ok"');
await sleep(800);
const afterSkip = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '每日阅读'); const day = document.querySelector('[data-plan-day=\"' + window.__D.keys[3] + '\"]'); const texts = day ? Array.from(day.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) : []; const next = Array.from(document.querySelectorAll('[data-plan-day=\"' + window.__D.keys[4] + '\"] .plan-text')).map((x) => x.textContent.trim()); return { exists: !!t, skipDates: t && t.skipDates, inDay: texts.includes('每日阅读'), inNextDay: next.includes('每日阅读') }; })()");
check('重复任务删除弹层与「跳过这一天」',
  delClick && delClick.found && delSheet && delSheet.title === '重复任务' && delSheet.desc.includes('每天重复') && delSheet.buttons.includes('skip') && delSheet.buttons.includes('all')
    && afterSkip && afterSkip.exists === true && afterSkip.inDay === false && afterSkip.inNextDay === true
    && Array.isArray(afterSkip.skipDates) && afterSkip.skipDates.includes(dates.keys[3]), { delSheet, afterSkip });

await evaluate("(() => { const day = document.querySelector('[data-plan-day=\"' + window.__D.keys[4] + '\"]'); const row = day && Array.from(day.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '每日阅读'); row.querySelector('[data-act=\"del-plan\"]').click(); return 'ok'; })()");
await sleep(500);
await evaluate('document.querySelector(\'[data-act="all"]\').click(); "ok"');
await sleep(800);
const afterAll = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const exists = raw.todos.some((x) => x.text === '每日阅读'); const rows = Array.from(document.querySelectorAll('[data-plan-task]')).filter((r) => r.querySelector('.plan-text').textContent.trim() === '每日阅读').length; return { exists, rows }; })()");
check('重复任务「全部删除」移除系列', afterAll && afterAll.exists === false && afterAll.rows === 0, afterAll);

await evaluate("(async () => { const st = await import('./js/store.js'); st.addTodo('复制来源', window.__D.prev[2]); return 'ok'; })()", true);
await evaluate('document.querySelector(\'[data-act="copy-last"]\').click(); "ok"');
await sleep(900);
const copied = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.filter((x) => x.text === '复制来源'); const day = document.querySelector('[data-plan-day=\"' + window.__D.keys[2] + '\"]'); const texts = day ? Array.from(day.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) : []; return { count: t.length, dates: t.map((x) => x.date), inDay: texts.includes('复制来源') }; })()");
check('界面「复制上周计划」复制到本周对应日',
  copied && copied.count === 2 && copied.dates.includes(dates.keys[2]) && copied.inDay, copied);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result19.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
