/* test20：v1.19 计划与记录打通
   静态：store 任务科目/setTodoDone、sheets initial/onSaved、plan/home 记一笔入口、样式、版本
   数据：addTodo 科目、setTodoDone 普通/重复、copyWeekTodos 保留科目
   界面：计划页科目与记一笔、记录预填与保存、取消不写入、重复任务按天完成、添加任务选科目、未来周无记一笔、首页记一笔
   用法：node _tools/test20.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8140 / 9381） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8140);
const DBG = Number(process.env.ST_DBG || 9381);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const sheetsSrc = read('js/sheets.js');
const planSrc = read('js/views/plan.js');
const homeSrc = read('js/views/home.js');
const planCss = read('css/parts/plan.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 任务科目与直接完成 API',
  storeSrc.includes('export function setTodoDone')
    && storeSrc.includes("export function addTodo(text, date, repeat = 'none', subjectId = null)")
    && storeSrc.includes('subjectId: subjectId || null')
    && storeSrc.includes('subjectId: t.subjectId ? String(t.subjectId) : null'), true);
check('记录弹层支持预填与 onSaved',
  sheetsSrc.includes('onSaved')
    && sheetsSrc.includes('initial.dateKey')
    && sheetsSrc.includes('initial.subjectId'), true);
check('计划页科目与记一笔入口',
  planSrc.includes('data-tsid')
    && planSrc.includes('data-act="record-plan"')
    && planSrc.includes('openRecordSheet')
    && planSrc.includes('setTodoDone')
    && planSrc.includes('activeSubjects'), true);
check('首页科目展示与记一笔入口',
  homeSrc.includes('data-act="record-todo"')
    && homeSrc.includes('todoMeta')
    && homeSrc.includes('setTodoDone')
    && homeSrc.includes('getSubject'), true);
check('记一笔按钮与科目样式', planCss.includes('.task-record') && planCss.includes('.plan-subject'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v41';")
    && manifestXml.includes('android:versionCode="35"') && manifestXml.includes('android:versionName="1.35"')
    && meSrc.includes('学习记录 v1.35'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile20-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result20.json'), JSON.stringify({ results }, null, 2));
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

const dates = await evaluate("(async () => { const u = await import('./js/util.js'); const ws = u.startOfWeek(new Date(), 1); const keys = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, i))); const prev = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, -7 + i))); const next = Array.from({ length: 7 }, (_, i) => u.dateKey(u.addDays(ws, 7 + i))); const today = u.dateKey(new Date()); const tomorrow = u.dateKey(u.addDays(new Date(), 1)); return { monday: keys[0], keys, prev, next, today, tomorrow }; })()", true);
check('日期环境（本周与相邻周）', dates && dates.keys.length === 7 && dates.monday === dates.keys[0] && dates.next[0] > dates.keys[6], dates);
await evaluate('window.__D = ' + JSON.stringify(dates) + '; "ok"');

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; st.resetAll(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const eng = st.addSubject({ name: '英语', emoji: '📘', color: '#4f6df5' }); const review = st.addTodo('复习导数', D.keys[0], 'none', math.id); const cancel = st.addTodo('取消记录', D.today, 'none', math.id); const daily = st.addTodo('每日听力', D.today, 'daily', eng.id); const future = st.addTodo('预习', D.next[0], 'none', eng.id); const prevTask = st.addTodo('上周数学', D.prev[0], 'none', math.id); const homeTask = st.addTodo('今日英语', D.today, 'none', eng.id); return { math: math.id, eng: eng.id, review: review.id, cancel: cancel.id, daily: daily.id, future: future.id, prevTask: prevTask.id, homeTask: homeTask.id, total: st.getState().todos.length }; })()", true);
check('种子任务写入（6 条）', seed && seed.total === 6 && seed.math && seed.eng, seed);
await evaluate('window.__D.math = ' + JSON.stringify(seed.math) + '; window.__D.eng = ' + JSON.stringify(seed.eng) + '; "ok"');

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; const review = st.todosOfDay(D.keys[0]).find((t) => t.text === '复习导数'); const added = st.addTodo('临时任务', D.keys[0], 'none', D.math); const tmp = st.addTodo('临时完成', D.keys[0], 'none', D.math); st.setTodoDone(tmp.id, D.keys[0], true); const tmpTrue = st.getState().todos.find((t) => t.id === tmp.id).done; st.setTodoDone(tmp.id, D.keys[0], false); const tmpFalse = st.getState().todos.find((t) => t.id === tmp.id).done; const daily = st.getState().todos.find((t) => t.text === '每日听力'); st.setTodoDone(daily.id, D.today, true); const dailyToday = st.todosOfDay(D.today).find((t) => t.text === '每日听力').done; const dailyTomorrow = st.todosOfDay(D.tomorrow).find((t) => t.text === '每日听力').done; const copied = st.copyWeekTodos(D.prev[0], D.keys[0]); const copiedTask = st.getState().todos.find((t) => t.text === '上周数学' && t.date === D.keys[0]); return { reviewSubject: review && review.subjectId, addedSubject: added && added.subjectId, tmpTrue, tmpFalse, dailyToday, dailyTomorrow, copied, copiedSubject: copiedTask && copiedTask.subjectId, doneDates: daily.doneDates.slice() }; })()", true);
check('任务保存科目并按天投影',
  data && data.reviewSubject === seed.math && data.addedSubject === seed.math, data);
check('setTodoDone 普通任务可完成/取消',
  data && data.tmpTrue === true && data.tmpFalse === false, data);
check('setTodoDone 重复任务只写当天',
  data && data.dailyToday === true && data.dailyTomorrow === false && data.doneDates.includes(dates.today), data);
check('复制上周保留任务科目',
  data && data.copied >= 1 && data.copiedSubject === seed.math && data.addedSubject === seed.math, data);

await evaluate('location.hash = "#/plan"; "ok"');
await sleep(900);
const planPage = await evaluate("(() => { const rows = Array.from(document.querySelectorAll('[data-plan-task]')); const rec = rows.filter((r) => r.querySelector('[data-act=\"record-plan\"]')); const badFuture = rows.filter((r) => r.dataset.planDate > window.__D.today && r.querySelector('[data-act=\"record-plan\"]')); const reviewRow = rows.find((r) => r.querySelector('.plan-title') && r.querySelector('.plan-title').textContent.trim() === '复习导数'); return { rows: rows.length, rec: rec.length, badFuture: badFuture.length, reviewSubject: reviewRow ? (reviewRow.querySelector('.plan-subject') || {}).textContent.trim() : '', hasAdd: !!document.querySelector('[data-add-day]') }; })()");
check('计划页按日期显示记一笔并展示科目',
  planPage && planPage.rows >= 5 && planPage.rec >= 3 && planPage.badFuture === 0
    && planPage.reviewSubject.includes('数学') && planPage.hasAdd, planPage);

await evaluate("(() => { const row = Array.from(document.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-title').textContent.trim() === '复习导数'); row.querySelector('[data-act=\"record-plan\"]').click(); return 'ok'; })()");
await sleep(700);
const sheet = await evaluate("({ title: document.querySelector('#r-title') ? document.querySelector('#r-title').value : '', date: document.querySelector('#r-date') ? document.querySelector('#r-date').value : '', subject: document.querySelector('#r-subjects [data-sid].on') ? document.querySelector('#r-subjects [data-sid].on').textContent.trim() : '', hasSave: !!document.querySelector('[data-act=\"save\"]') })");
check('记一笔弹层预填任务标题/科目/日期',
  sheet && sheet.title === '复习导数' && sheet.date === dates.keys[0] && sheet.subject.includes('数学') && sheet.hasSave, sheet);

await evaluate("(() => { document.querySelector('#r-minutes').value = '45'; document.querySelector('[data-act=\"save\"]').click(); return 'ok'; })()");
await sleep(1000);
const saved = await evaluate("(async () => { const u = await import('./js/util.js'); const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '复习导数'); const s = raw.sessions.find((x) => x.title === '复习导数'); return { done: t && t.done, session: !!s, subjectId: s && s.subjectId, minutes: s && s.minutes, day: s ? u.dateKey(new Date(s.end)) : '', sheetGone: !document.querySelector('#r-title') }; })()", true);
check('保存记录后任务自动完成且记录归属正确',
  saved && saved.done === true && saved.session && saved.subjectId === seed.math && saved.minutes === 45 && saved.day === dates.keys[0] && saved.sheetGone, saved);

await evaluate("(() => { const row = Array.from(document.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-title').textContent.trim() === '取消记录'); row.querySelector('[data-act=\"record-plan\"]').click(); return 'ok'; })()");
await sleep(600);
await evaluate("document.querySelector('#sheet [data-act=\"cancel\"]').click(); 'ok'");
await sleep(700);
const canceled = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '取消记录'); const s = raw.sessions.some((x) => x.title === '取消记录'); return { done: t && t.done, session: s, sheetGone: !document.querySelector('#r-title') }; })()");
check('取消记一笔不写记录不勾任务', canceled && canceled.done === false && canceled.session === false && canceled.sheetGone, canceled);

await evaluate("(() => { const row = Array.from(document.querySelectorAll('[data-plan-task]')).find((r) => r.querySelector('.plan-title').textContent.trim() === '每日听力'); row.querySelector('[data-act=\"record-plan\"]').click(); return 'ok'; })()");
await sleep(600);
await evaluate("(() => { document.querySelector('#r-minutes').value = '10'; document.querySelector('[data-act=\"save\"]').click(); return 'ok'; })()");
await sleep(900);
const repeatSaved = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '每日听力'); return { doneDates: t && t.doneDates, count: raw.sessions.filter((x) => x.title === '每日听力').length }; })()");
check('重复任务记一笔只完成当天',
  repeatSaved && Array.isArray(repeatSaved.doneDates) && repeatSaved.doneDates.includes(dates.today) && !repeatSaved.doneDates.includes(dates.tomorrow) && repeatSaved.count === 1, repeatSaved);

const addDay = dates.keys[0];
await evaluate("document.querySelector('[data-add-day=\"" + addDay + "\"]').click(); 'ok'");
await sleep(600);
const addSheet = await evaluate("({ chips: Array.from(document.querySelectorAll('#task-subjects [data-tsid]')).map((b) => b.textContent.trim()), hasInput: !!document.querySelector('#prompt-input'), repeats: Array.from(document.querySelectorAll('#repeat-chips [data-repeat]')).length })");
check('添加任务弹层有科目选择', addSheet && addSheet.chips.length === 3 && addSheet.chips.some((x) => x.includes('数学')) && addSheet.chips.some((x) => x.includes('英语')) && addSheet.hasInput && addSheet.repeats === 4, addSheet);
await evaluate("(() => { document.querySelector('#task-subjects [data-tsid=\"" + seed.math + "\"]').click(); const inp = document.querySelector('#prompt-input'); inp.value = '科目任务'; document.querySelector('#repeat-chips [data-repeat=\"weekly\"]').click(); document.querySelector('[data-act=\"yes\"]').click(); return 'ok'; })()");
await sleep(900);
const addedTask = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '科目任务'); return { subjectId: t && t.subjectId, repeat: t && t.repeat, date: t && t.date, sheetGone: !document.querySelector('#prompt-input') }; })()");
check('添加任务保存科目与重复规则',
  addedTask && addedTask.subjectId === seed.math && addedTask.repeat === 'weekly' && addedTask.date === addDay && addedTask.sheetGone, addedTask);

await evaluate("location.hash = '#/plan?week=' + window.__D.next[0]; 'ok'");
await sleep(900);
const nextPage = await evaluate("(() => { const rows = Array.from(document.querySelectorAll('[data-plan-task]')); return { rows: rows.length, rec: rows.filter((r) => r.querySelector('[data-act=\"record-plan\"]')).length, texts: rows.map((r) => r.querySelector('.plan-title').textContent.trim()) }; })()");
check('未来周不显示记一笔', nextPage && nextPage.rows >= 1 && nextPage.rec === 0 && nextPage.texts.includes('预习'), nextPage);

await evaluate('location.hash = "#/home"; "ok"');
await sleep(900);
const homePage = await evaluate("(() => { const rows = Array.from(document.querySelectorAll('[data-todo]')); const row = rows.find((r) => r.querySelector('.row-title').textContent.trim() === '今日英语'); return { found: !!row, meta: row ? (row.querySelector('.row-sub') || {}).textContent.trim() : '', rec: row ? !!row.querySelector('[data-act=\"record-todo\"]') : false }; })()");
check('首页任务展示科目与记一笔', homePage && homePage.found && homePage.meta.includes('英语') && homePage.rec, homePage);

await evaluate("(() => { const row = Array.from(document.querySelectorAll('[data-todo]')).find((r) => r.querySelector('.row-title').textContent.trim() === '今日英语'); row.querySelector('[data-act=\"record-todo\"]').click(); return 'ok'; })()");
await sleep(700);
const homeSheet = await evaluate("({ title: document.querySelector('#r-title') ? document.querySelector('#r-title').value : '', date: document.querySelector('#r-date') ? document.querySelector('#r-date').value : '', subject: document.querySelector('#r-subjects [data-sid].on') ? document.querySelector('#r-subjects [data-sid].on').textContent.trim() : '' })");
check('首页记一笔预填任务信息', homeSheet && homeSheet.title === '今日英语' && homeSheet.date === dates.today && homeSheet.subject.includes('英语'), homeSheet);
await evaluate("(() => { document.querySelector('#r-minutes').value = '20'; document.querySelector('[data-act=\"save\"]').click(); return 'ok'; })()");
await sleep(1000);
const homeSaved = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = raw.todos.find((x) => x.text === '今日英语'); const s = raw.sessions.find((x) => x.title === '今日英语'); return { done: t && t.done, subjectId: s && s.subjectId, minutes: s && s.minutes, sheetGone: !document.querySelector('#r-title') }; })()");
check('首页记一笔后任务完成且记录正确',
  homeSaved && homeSaved.done === true && homeSaved.subjectId === seed.eng && homeSaved.minutes === 20 && homeSaved.sheetGone, homeSaved);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result20.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
