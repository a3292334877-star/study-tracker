/* test18：v1.19 学习计划（#/plan 周计划 + 今日任务）
   1) 静态：store 计划函数（todosOfDay/planWeek/todoDate/isDateKey）/ plan 视图与样式 / 路由 / 首页与我的入口 / 版本资源
   2) 数据：todosOfDay 按日期过滤、planWeek 默认周一开始 7 天、合计/完成率/跨周隔离、weekStart=0、旧任务无 date 按 createdAt 回退、addTodo 指定日期
   3) 界面：首页只显示今日任务与「本周计划」入口、计划页 7 天卡片/任务状态/完成率、勾选、添加、删除、上一周/下一周切换
   用法：node _tools/test18.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8138 / 9379） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8138);
const DBG = Number(process.env.ST_DBG || 9379);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const planSrc = read('js/views/plan.js');
const planCss = read('css/parts/plan.css');
const appSrc = read('js/app.js');
const homeSrc = read('js/views/home.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const indexHtml = read('index.html');

check('store 计划数据函数（todosOfDay/planWeek/todoDate/isDateKey）',
  storeSrc.includes('export function todosOfDay')
    && storeSrc.includes('export function planWeek')
    && storeSrc.includes('function todoDate')
    && storeSrc.includes('function isDateKey')
    && storeSrc.includes('todoDate(t) === key')
    && storeSrc.includes('date: todoDate(t)'), true);
check('计划视图与样式',
  planSrc.includes('export function renderPlan')
    && planSrc.includes('data-week-step')
    && planSrc.includes('data-plan-task')
    && planSrc.includes('data-add-day')
    && planSrc.includes('toggle-plan')
    && planSrc.includes('del-plan')
    && planCss.includes('.plan-day')
    && planCss.includes('.plan-check'), true);
check('计划路由',
  appSrc.includes("import { renderPlan } from './views/plan.js'")
    && appSrc.includes('plan: renderPlan'), true);
check('首页与我的计划入口',
  homeSrc.includes('todosOfDay')
    && homeSrc.includes('data-act="plan"')
    && meSrc.includes('data-act="plan"'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24 / 资源',
  swSrc.includes("const CACHE = 'study-tracker-v38';")
    && manifestXml.includes('android:versionCode="32"') && manifestXml.includes('android:versionName="1.32"')
    && meSrc.includes('学习记录 v1.32')
    && swSrc.includes('./js/views/plan.js') && swSrc.includes('./css/parts/plan.css')
    && indexHtml.includes('css/parts/plan.css'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile18-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result18.json'), JSON.stringify({ results }, null, 2));
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

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

/* ---------- 3. 计算相对今天的本地日期键（全部在页面内算，避开时区陷阱） ---------- */
const dates = await evaluate(`(async () => {
  const u = await import('./js/util.js');
  const today = new Date();
  const ws = u.startOfWeek(today, 1);
  const keys = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, i)));
  const prevKeys = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, -7 + i)));
  const nextKeys = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, 7 + i)));
  const legacyDay = u.addDays(today, -3);
  const legacyTs = new Date(legacyDay.getFullYear(), legacyDay.getMonth(), legacyDay.getDate(), 12, 0, 0).getTime();
  return { todayKey: u.dateKey(today), mondayKey: keys[0], weekKeys: keys, prevKeys, nextKeys, legacyKey: u.dateKey(legacyDay), legacyTs };
})()`, true);
if (!dates || dates.__error) {
  check('日期环境', false, dates && dates.__error);
} else {
  check('日期环境（本地周一与 7 天键）', dates.weekKeys.length === 7 && dates.weekKeys[0] === dates.mondayKey, dates);
}

/* ---------- 4. 旧任务没有 date：normalize 应回退到 createdAt ---------- */
await evaluate(`(() => {
  const raw = {
    v: 1, settings: {}, subjects: [], sessions: [], templates: [],
    todos: [{ id: 'legacy-1', text: '旧任务无日期', done: false, createdAt: ${dates.legacyTs} }],
    reviews: {}, demo: false, seeded: true, createdAt: Date.now(),
  };
  localStorage.setItem('study-tracker/v1', JSON.stringify(raw));
  location.reload();
  return 'ok';
})()`);
await sleep(1700);
const legacy = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const todo = st.getState().todos.find((t) => t.id === 'legacy-1');
  return { date: todo && todo.date, hits: st.todosOfDay(${JSON.stringify(dates.legacyKey)}).map((t) => t.text), total: st.getState().todos.length };
})()`, true);
check('旧任务无 date 时按 createdAt 回退',
  legacy && legacy.date === dates.legacyKey && legacy.hits.includes('旧任务无日期') && legacy.total === 1, legacy);

/* ---------- 5. 固定种子：本周 6 条任务 + 2 条学习记录 ---------- */
const ti = dates.weekKeys.indexOf(dates.todayKey);
const seedSpec = [
  { text: '今日背单词', key: dates.todayKey, done: true },
  { text: '今日数学练习', key: dates.todayKey, done: false },
  { text: '计划日任务A', key: dates.weekKeys[(ti + 1) % 7], done: false },
  { text: '计划日任务B', key: dates.weekKeys[(ti + 3) % 7], done: true },
  { text: '上周遗留任务', key: dates.prevKeys[5], done: false },
  { text: '下周预习任务', key: dates.nextKeys[2], done: false },
];
const sessDay = dates.weekKeys[(ti + 2) % 7];
const seed = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const u = await import('./js/util.js');
  st.resetAll();
  const subj = st.addSubject({ name: '数学', emoji: '📐', color: '#4f6df5' });
  const addSess = (key, minutes) => {
    const d = u.parseKey(key);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0, 0).getTime();
    st.addSession({ subjectId: subj.id, start, end: start + minutes * 60000, minutes, tags: [], title: '计划测试' });
  };
  addSess(${JSON.stringify(dates.todayKey)}, 30);
  addSess(${JSON.stringify(sessDay)}, 45);
  const mk = (text, key, done) => { const t = st.addTodo(text, key); if (done) st.toggleTodo(t.id); return t.id; };
  ${seedSpec.map((t) => 'mk(' + JSON.stringify(t.text) + ', ' + JSON.stringify(t.key) + ', ' + t.done + ');').join('\n  ')}
  return { subjects: st.getState().subjects.length, sessions: st.getState().sessions.length, todos: st.getState().todos.length };
})()`, true);
check('种子数据写入', seed && seed.subjects === 1 && seed.sessions === 2 && seed.todos === seedSpec.length, seed);

/* ---------- 6. todosOfDay 纯函数 ---------- */
const dayCheck = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  return {
    today: st.todosOfDay(${JSON.stringify(dates.todayKey)}).map((t) => t.text),
    otherA: st.todosOfDay(${JSON.stringify(seedSpec[2].key)}).map((t) => t.text),
    absent: st.todosOfDay('1999-01-01').length,
  };
})()`, true);
check('todosOfDay 只返回指定日期任务',
  dayCheck && JSON.stringify(dayCheck.today) === JSON.stringify(['今日背单词', '今日数学练习'])
    && JSON.stringify(dayCheck.otherA) === JSON.stringify(['计划日任务A']) && dayCheck.absent === 0, dayCheck);

/* ---------- 7. planWeek 纯数据 ---------- */
const wk = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const w = st.planWeek(${JSON.stringify(dates.todayKey)});
  return {
    startKey: w.startKey, endKey: w.endKey, total: w.total, done: w.done, pending: w.pending, pct: w.pct, minutes: w.minutes,
    days: w.days.map((d) => ({ key: d.key, weekday: d.weekday, isToday: d.isToday, total: d.total, done: d.done, pct: d.pct, minutes: d.minutes, todos: d.todos.map((t) => t.text) })),
  };
})()`, true);
const inWeekSpec = seedSpec.filter((t) => dates.weekKeys.includes(t.key));
const expDone = inWeekSpec.filter((t) => t.done).length;
check('planWeek 默认周一开始 7 天',
  wk && wk.startKey === dates.mondayKey && wk.endKey === dates.weekKeys[6] && wk.days.length === 7
    && JSON.stringify(wk.days.map((d) => d.key)) === JSON.stringify(dates.weekKeys)
    && JSON.stringify(wk.days.map((d) => d.weekday)) === JSON.stringify([1, 2, 3, 4, 5, 6, 0])
    && wk.days.filter((d) => d.isToday).length === 1 && wk.days.find((d) => d.isToday).key === dates.todayKey,
  wk && { startKey: wk.startKey, endKey: wk.endKey, weekdays: wk.days.map((d) => d.weekday) });
check('planWeek 合计与完成率',
  wk && wk.total === inWeekSpec.length && wk.done === expDone && wk.pending === inWeekSpec.length - expDone
    && wk.pct === Math.round((expDone / inWeekSpec.length) * 100) && wk.minutes === 75
    && wk.days.find((d) => d.key === dates.todayKey).total === 2
    && wk.days.find((d) => d.key === dates.todayKey).done === 1
    && wk.days.find((d) => d.key === dates.todayKey).minutes === 30,
  wk && { total: wk.total, done: wk.done, pct: wk.pct, minutes: wk.minutes });
const cross = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const p = st.planWeek(${JSON.stringify(dates.prevKeys[0])});
  const n = st.planWeek(${JSON.stringify(dates.nextKeys[0])});
  const flat = (w) => w.days.reduce((a, d) => a.concat(d.todos.map((t) => t.text)), []);
  return { prev: flat(p), next: flat(n), prevTotal: p.total, nextTotal: n.total };
})()`, true);
check('planWeek 跨周任务不混入',
  cross && JSON.stringify(cross.prev) === JSON.stringify(['上周遗留任务']) && cross.prevTotal === 1
    && JSON.stringify(cross.next) === JSON.stringify(['下周预习任务']) && cross.nextTotal === 1, cross);
const ws0 = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const u = await import('./js/util.js');
  const monday = ${JSON.stringify(dates.mondayKey)};
  st.setSetting('weekStart', 0);
  const w = st.planWeek(${JSON.stringify(dates.todayKey)});
  st.setSetting('weekStart', 1);
  return { start: w.startKey, sunday: u.dateKey(u.addDays(u.parseKey(monday), -1)), firstWeekday: w.days[0].weekday, len: w.days.length };
})()`, true);
check('planWeek 尊重 weekStart=0（周日起始）',
  ws0 && ws0.start === ws0.sunday && ws0.firstWeekday === 0 && ws0.len === 7, ws0);

/* ---------- 8. addTodo 指定日期 ---------- */
const otherC = dates.weekKeys[(ti + 5) % 7];
const addRes = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const before = st.getState().todos.length;
  const t = st.addTodo('指定日期任务', ${JSON.stringify(otherC)});
  const auto = st.addTodo('默认日期任务');
  const autoDate = auto.date;
  st.removeTodo(auto.id);
  const found = st.getState().todos.find((x) => x.id === t.id);
  return { date: found && found.date, text: found && found.text, autoDate, todayKey: st.dateKey(new Date()), count: st.getState().todos.length, before };
})()`, true);
check('addTodo 可指定日期（默认今天）',
  addRes && addRes.date === otherC && addRes.text === '指定日期任务' && addRes.autoDate === dates.todayKey && addRes.count === addRes.before + 1,
  addRes);

/* ---------- 9. 首页：只显示今天任务 + 本周计划入口 ---------- */
await evaluate('location.hash = "#/home"; "ok"');
await sleep(800);
const home = await evaluate(`(() => {
  const rows = Array.from(document.querySelectorAll('#todo-list [data-todo]'));
  return {
    texts: rows.map((r) => r.querySelector('.row-title').textContent.trim()),
    count: rows.length,
    planBtn: !!document.querySelector('[data-act="plan"]'),
  };
})()`);
check('首页只显示今天任务且不显示其他天任务',
  home && JSON.stringify(home.texts) === JSON.stringify(['今日背单词', '今日数学练习']) && home.count === 2 && home.planBtn, home);
await evaluate('document.querySelector("[data-act=\\"plan\\"]").click(); "ok"');
await sleep(800);
const nav = await evaluate(`({ hash: location.hash, title: document.querySelector('#page-title') ? document.querySelector('#page-title').textContent : '', days: document.querySelectorAll('.card.plan-day').length })`);
check('首页「本周计划」入口进入 #/plan', nav && nav.hash === '#/plan' && nav.title === '学习计划' && nav.days === 7, nav);

/* ---------- 10. 计划页：7 天卡片与任务状态 ---------- */
const e2eTodos = seedSpec.filter((x) => dates.weekKeys.includes(x.key)).concat([{ text: '指定日期任务', key: otherC, done: false }]);
const planPage = await evaluate(`(() => {
  const cards = Array.from(document.querySelectorAll('.card.plan-day'));
  const rows = Array.from(document.querySelectorAll('[data-plan-task]')).map((r) => ({
    text: r.querySelector('.plan-text').textContent.trim(),
    done: r.classList.contains('done'),
    check: r.querySelector('.plan-check').textContent.trim(),
    day: r.closest('[data-plan-day]').dataset.planDay,
  }));
  const todayCard = document.querySelector('.card.plan-day.is-today');
  return {
    count: cards.length,
    dayKeys: cards.map((c) => c.dataset.planDay),
    todayKey: todayCard ? todayCard.dataset.planDay : '',
    todayBadge: todayCard && todayCard.querySelector('.plan-day-title em') ? todayCard.querySelector('.plan-day-title em').textContent.trim() : '',
    todayMeta: todayCard && todayCard.querySelector('.plan-day-meta') ? todayCard.querySelector('.plan-day-meta').textContent.split(' ').join('') : '',
    rows,
  };
})()`);
const rowsOk = e2eTodos.every((x) => planPage && planPage.rows.some((r) => r.text === x.text && r.day === x.key && r.done === x.done && r.check === (x.done ? '✓' : '○')));
check('计划页 7 天卡片、任务文本与勾选状态',
  planPage && planPage.count === 7 && JSON.stringify(planPage.dayKeys) === JSON.stringify(dates.weekKeys)
    && planPage.todayKey === dates.todayKey && planPage.todayBadge === '今天' && planPage.todayMeta.includes('1/2完成') && rowsOk,
  planPage && { count: planPage.count, today: planPage.todayKey, todayBadge: planPage.todayBadge, todayMeta: planPage.todayMeta, rows: planPage.rows.length });
const hero = await evaluate(`(() => {
  const v = document.querySelector('.hero-value');
  const bar = document.querySelector('.hero-bar i');
  return { value: v ? v.textContent.split(' ').join('') : '', sub: document.querySelector('.hero-sub') ? document.querySelector('.hero-sub').textContent : '', bar: bar ? bar.style.width : '' };
})()`);
const expTotal = e2eTodos.length;
const expDone0 = e2eTodos.filter((t) => t.done).length;
check('计划页完成率文案',
  hero && hero.value === expDone0 + '/' + expTotal + '项' && hero.sub.includes('完成率 ' + Math.round((expDone0 / expTotal) * 100) + '%') && hero.bar === Math.round((expDone0 / expTotal) * 100) + '%',
  hero);

/* ---------- 11. 勾选任务：done/pct 与 localStorage ---------- */
const toggleClick = await evaluate(`(() => {
  const row = Array.from(document.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '今日数学练习');
  if (!row) return { found: false };
  row.querySelector('[data-act="toggle-plan"]').click();
  return { found: true };
})()`);
await sleep(800);
const afterToggle = await evaluate(`(() => {
  const raw = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const t = raw.todos.find((x) => x.text === '今日数学练习');
  const row = Array.from(document.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '今日数学练习');
  const bar = document.querySelector('.hero-bar i');
  return {
    done: t ? t.done : null,
    rowDone: row ? row.classList.contains('done') : null,
    check: row ? row.querySelector('.plan-check').textContent.trim() : '',
    hero: document.querySelector('.hero-value') ? document.querySelector('.hero-value').textContent.split(' ').join('') : '',
    sub: document.querySelector('.hero-sub') ? document.querySelector('.hero-sub').textContent : '',
    bar: bar ? bar.style.width : '',
  };
})()`);
const expDone1 = expDone0 + 1;
check('勾选任务后 done/pct 与 localStorage 更新',
  toggleClick && toggleClick.found && afterToggle && afterToggle.done === true && afterToggle.rowDone === true && afterToggle.check === '✓'
    && afterToggle.hero === expDone1 + '/' + expTotal + '项'
    && afterToggle.sub.includes('完成率 ' + Math.round((expDone1 / expTotal) * 100) + '%')
    && afterToggle.bar === Math.round((expDone1 / expTotal) * 100) + '%',
  afterToggle);

/* ---------- 12. 添加某天任务 ---------- */
const addDay = dates.weekKeys[(ti + 6) % 7];
await evaluate('document.querySelector(\'[data-add-day="' + addDay + '"]\').click(); "ok"');
await sleep(500);
const addSheet = await evaluate(`({ hasInput: !!document.querySelector('#prompt-input'), desc: document.querySelector('.sheet-desc') ? document.querySelector('.sheet-desc').textContent : '' })`);
await evaluate(`(() => {
  const inp = document.querySelector('#prompt-input');
  inp.value = '界面添加任务';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-act="yes"]').click();
  return 'ok';
})()`);
await sleep(900);
const afterAdd = await evaluate(`(() => {
  const raw = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const t = raw.todos.find((x) => x.text === '界面添加任务');
  const day = document.querySelector('[data-plan-day="${addDay}"]');
  const texts = day ? Array.from(day.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) : [];
  return { date: t && t.date, inDay: texts.includes('界面添加任务'), sheetGone: !document.querySelector('#prompt-input') };
})()`);
check('计划页添加某天任务',
  addSheet && addSheet.hasInput && afterAdd && afterAdd.date === addDay && afterAdd.inDay && addAfter_sheetGone(afterAdd), { addSheet, afterAdd });

function addAfter_sheetGone(x) { return x.sheetGone === true; }

/* ---------- 13. 删除任务 ---------- */
const delClick = await evaluate(`(() => {
  const day = document.querySelector('[data-plan-day="${addDay}"]');
  const row = day && Array.from(day.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-text').textContent.trim() === '界面添加任务');
  if (!row) return { found: false };
  row.querySelector('[data-act="del-plan"]').click();
  return { found: true };
})()`);
await sleep(800);
const afterDel = await evaluate(`(() => {
  const raw = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const day = document.querySelector('[data-plan-day="${addDay}"]');
  const texts = day ? Array.from(day.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) : [];
  return { inState: raw.todos.some((x) => x.text === '界面添加任务'), inDay: texts.includes('界面添加任务') };
})()`);
check('计划页删除任务', delClick && delClick.found && !afterDel.inState && !afterDel.inDay, afterDel);

/* ---------- 14. 上一周 / 下一周切换 ---------- */
const nav0 = await evaluate(`(() => { const c = document.querySelector('.card.plan-day'); return { hash: location.hash, range: document.querySelector('.year-label') ? document.querySelector('.year-label').textContent : '', first: c ? c.dataset.planDay : '' }; })()`);
await evaluate('document.querySelector(\'[data-week-step="-1"]\').click(); "ok"');
await sleep(800);
const navPrev = await evaluate(`(() => { const c = document.querySelector('.card.plan-day'); return { hash: location.hash, range: document.querySelector('.year-label') ? document.querySelector('.year-label').textContent : '', first: c ? c.dataset.planDay : '', texts: Array.from(document.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) }; })()`);
await evaluate('document.querySelector(\'[data-week-step="1"]\').click(); "ok"');
await sleep(800);
const navBack = await evaluate(`(() => { const c = document.querySelector('.card.plan-day'); return { hash: location.hash, range: document.querySelector('.year-label') ? document.querySelector('.year-label').textContent : '', first: c ? c.dataset.planDay : '' }; })()`);
await evaluate('document.querySelector(\'[data-week-step="1"]\').click(); "ok"');
await sleep(800);
const navNext = await evaluate(`(() => { const c = document.querySelector('.card.plan-day'); return { hash: location.hash, range: document.querySelector('.year-label') ? document.querySelector('.year-label').textContent : '', first: c ? c.dataset.planDay : '', texts: Array.from(document.querySelectorAll('.plan-text')).map((x) => x.textContent.trim()) }; })()`);
check('上一周/下一周切换（URL query 与日期范围变化）',
  nav0 && navPrev && navBack && navNext
    && navPrev.hash === '#/plan?week=' + dates.prevKeys[0] && navPrev.first === dates.prevKeys[0]
    && navPrev.range !== nav0.range && navPrev.texts.includes('上周遗留任务')
    && navBack.hash === '#/plan?week=' + dates.mondayKey && navBack.first === dates.mondayKey && navBack.range === nav0.range
    && navNext.hash === '#/plan?week=' + dates.nextKeys[0] && navNext.first === dates.nextKeys[0]
    && navNext.range !== nav0.range && navNext.texts.includes('下周预习任务'),
  { nav0, navPrev, navBack, navNext });

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));

/* ---------- 收尾 ---------- */
ws.close();
edge.kill();
server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result18.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
