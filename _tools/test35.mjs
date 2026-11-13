/* test35：v1.33 学习计划模板 + 任务预计时长
   静态：store 模板/时长 API、plan 工具栏与弹层、样式、版本
   数据：保存模板（周内偏移/科目/时长）、套用到下一周、去重、删除
   界面：任务时长选择与保存、计划页时长徽标、存为模板、套用模板、删除模板
   用法：node _tools/test35.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8158 / 9399） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8158);
const DBG = Number(process.env.ST_DBG || 9399);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const planSrc = read('js/views/plan.js');
const todosSrc = read('js/views/todos.js');
const planCss = read('css/parts/plan.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 提供计划模板 API',
  storeSrc.includes('export function getPlanTemplates') && storeSrc.includes('export function savePlanTemplate')
    && storeSrc.includes('export function applyPlanTemplate') && storeSrc.includes('export function removePlanTemplate')
    && storeSrc.includes('planTemplates: []'), true);
check('store 提供任务预计时长 API 且 addTodo 签名不变',
  storeSrc.includes('export function setTodoMinutes')
    && storeSrc.includes("export function addTodo(text, date, repeat = 'none', subjectId = null)")
    && storeSrc.includes('minutes: Math.max(0, Math.min(1440, Math.round(Number(t.minutes) || 0)))'), true);
check('计划页接入模板工具栏与时长',
  planSrc.includes('data-act="tpl-save"') && planSrc.includes('data-act="tpl-open"')
    && planSrc.includes('openSavePlanTemplateSheet') && planSrc.includes('openPlanTemplatesSheet')
    && planSrc.includes('data-min="') && planSrc.includes('setTodoMinutes'), true);
check('任务中心展示预计时长',
  todosSrc.includes('plan-duration') && todosSrc.includes('fmtMinShort') && todosSrc.includes('setTodoMinutes'), true);
check('样式包含模板与时长',
  planCss.includes('.plan-duration') && planCss.includes('.plan-tool') && planCss.includes('.plan-tpl-row')
    && planCss.includes('.plan-tpl-name'), true);
check('版本：sw v40 / manifest 34-1.34 / 页脚 v1.34',
  swSrc.includes("const CACHE = 'study-tracker-v40';")
    && manifestXml.includes('android:versionCode="34"')
    && manifestXml.includes('android:versionName="1.34"')
    && meSrc.includes('学习记录 v1.34'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile35-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result35.json'), JSON.stringify({ results }, null, 2));
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

const D = await evaluate("(async () => { const u = await import('./js/util.js'); const ws = u.startOfWeek(new Date(), 1); const keys = Array.from({ length: 14 }, (_, i) => u.dateKey(u.addDays(ws, i))); return { thisWeek: keys.slice(0, 7), nextWeek: keys.slice(7, 14), today: u.dateKey(new Date()) }; })()", true);
check('日期环境（本周 / 下周）', D && D.thisWeek.length === 7 && D.nextWeek.length === 7 && D.nextWeek[0] > D.thisWeek[6], D);
await evaluate('window.__D = ' + JSON.stringify(D) + '; "ok"');

/* ---------- 数据：保存 / 套用 / 去重 / 删除 ---------- */
const saved = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; st.resetAll(); const math = st.addSubject({ name: '数学', emoji: '📐' }); const a = st.addTodo('本周数学', D.thisWeek[0], 'none', math.id); st.setTodoMinutes(a.id, 45); const b = st.addTodo('本周英语', D.thisWeek[2], 'none', null); st.setTodoMinutes(b.id, 30); const tpl = st.savePlanTemplate('标准周', D.thisWeek[0]); return { math: math.id, tplId: tpl && tpl.id, name: tpl && tpl.name, tasks: tpl && tpl.tasks, count: st.getPlanTemplates().length }; })()", true);
check('保存本周计划为模板',
  saved && saved.tplId && saved.name === '标准周' && saved.count === 1 && saved.tasks.length === 2
    && saved.tasks.some((x) => x.dayOffset === 0 && x.text === '本周数学' && x.minutes === 45 && x.subjectId === saved.math)
    && saved.tasks.some((x) => x.dayOffset === 2 && x.text === '本周英语' && x.minutes === 30 && !x.subjectId), saved);
const applied = await evaluate("(async () => { const st = await import('./js/store.js'); const D = window.__D; const tpl = st.getPlanTemplates()[0]; const n1 = st.applyPlanTemplate(tpl.id, D.nextWeek[0]); const rows = st.getState().todos.filter((t) => t.fromPlanTemplate === tpl.id); const n2 = st.applyPlanTemplate(tpl.id, D.nextWeek[0]); const again = st.getState().todos.filter((t) => t.fromPlanTemplate === tpl.id).length; return { n1, n2, again, rows: rows.map((t) => ({ text: t.text, date: t.date, minutes: t.minutes, repeat: t.repeat, subjectId: t.subjectId })) }; })()", true);
check('套用模板到下周一/三并带科目与时长',
  applied && applied.n1 === 2 && applied.n2 === 0 && applied.again === 2
    && applied.rows.some((x) => x.text === '本周数学' && x.date === D.nextWeek[0] && x.minutes === 45 && x.repeat === 'none' && x.subjectId === saved.math)
    && applied.rows.some((x) => x.text === '本周英语' && x.date === D.nextWeek[2] && x.minutes === 30), applied);
const removedTpl = await evaluate("(async () => { const st = await import('./js/store.js'); const id = st.getPlanTemplates()[0].id; const ok = st.removePlanTemplate(id); return { ok, count: st.getPlanTemplates().length }; })()", true);
check('删除计划模板', removedTpl && removedTpl.ok === true && removedTpl.count === 0, removedTpl);

/* ---------- 界面：任务时长与计划模板 ---------- */
await evaluate('location.hash = "#/plan?week=" + window.__D.thisWeek[0]; "ok"');
await sleep(1100);
const planTools = await evaluate("(function () { return { hasSave: !!document.querySelector('[data-act=tpl-save]'), hasOpen: !!document.querySelector('[data-act=tpl-open]'), openText: document.querySelector('[data-act=tpl-open]') ? document.querySelector('[data-act=tpl-open]').textContent.trim() : '' }; })()");
check('计划页显示模板工具栏', planTools && planTools.hasSave && planTools.hasOpen && planTools.openText.indexOf('计划模板') >= 0, planTools);

await evaluate('document.querySelector("[data-add-day=\\"" + window.__D.thisWeek[6] + "\\"]").click(); "ok"');
await sleep(500);
const minSheet = await evaluate("(function () { return { chips: Array.from(document.querySelectorAll('#task-minutes [data-min]')).map(function (b) { return b.textContent.trim(); }), count: document.querySelectorAll('#task-minutes [data-min]').length }; })()");
check('添加任务弹层有 6 个预计时长选项', minSheet && minSheet.count === 6 && minSheet.chips.indexOf('不设') >= 0 && minSheet.chips.indexOf('45 分钟') >= 0, minSheet);
await evaluate(`(function () { document.querySelector('#task-subjects [data-tsid="${saved.math}"]').click(); document.querySelector('#prompt-input').value = '界面任务'; document.querySelector('#task-minutes [data-min="30"]').click(); document.querySelector('#sheet [data-act=yes]').click(); return 'ok'; })()`);
await sleep(900);
const minSaved = await evaluate("(async function () { const st = await import('./js/store.js'); const t = st.getState().todos.find(function (x) { return x.text === '界面任务'; }); return { exists: Boolean(t), minutes: t && t.minutes, subjectId: t && t.subjectId, duration: Array.from(document.querySelectorAll('.plan-duration')).map(function (x) { return x.textContent.trim(); }) }; })()", true);
check('添加任务保存预计时长', minSaved && minSaved.exists && minSaved.minutes === 30 && minSaved.subjectId === saved.math, minSaved);
check('计划页显示时长徽标', minSaved && minSaved.duration.some(function (x) { return x.indexOf('30分') >= 0; }), minSaved);

/* 保存为模板（界面） */
await evaluate('document.querySelector("[data-act=tpl-save]").click(); "ok"');
await sleep(500);
const saveSheet = await evaluate("(function () { return { title: document.querySelector('#sheet .sheet-title') ? document.querySelector('#sheet .sheet-title').textContent.trim() : '', hasInput: !!document.querySelector('#sheet #prompt-input') }; })()");
check('存为模板弹层可输入名称', saveSheet && saveSheet.title === '存为计划模板' && saveSheet.hasInput, saveSheet);
await evaluate("(function () { document.querySelector('#sheet #prompt-input').value = '界面模板'; document.querySelector('#sheet [data-act=yes]').click(); return 'ok'; })()");
await sleep(900);
const uiTpl = await evaluate("(async function () { const st = await import('./js/store.js'); const list = st.getPlanTemplates(); return { count: list.length, name: list[0] && list[0].name, tasks: list[0] ? list[0].tasks.length : 0, openText: document.querySelector('[data-act=tpl-open]') ? document.querySelector('[data-act=tpl-open]').textContent.trim() : '' }; })()", true);
check('界面保存模板成功', uiTpl && uiTpl.count === 1 && uiTpl.name === '界面模板' && uiTpl.tasks >= 3, uiTpl);

/* 切到下一周，套用模板 */
await evaluate('location.hash = "#/plan?week=" + window.__D.nextWeek[0]; "ok"');
await sleep(1000);
await evaluate('document.querySelector("[data-act=tpl-open]").click(); "ok"');
await sleep(500);
const tplSheet = await evaluate("(function () { return { title: document.querySelector('#sheet .sheet-title') ? document.querySelector('#sheet .sheet-title').textContent.trim() : '', rows: document.querySelectorAll('#sheet [data-tpl]').length, name: document.querySelector('#sheet .plan-tpl-name') ? document.querySelector('#sheet .plan-tpl-name').textContent.trim() : '', meta: document.querySelector('#sheet .plan-tpl-meta') ? document.querySelector('#sheet .plan-tpl-meta').textContent.trim() : '' }; })()");
check('计划模板弹层列出模板', tplSheet && tplSheet.title === '计划模板' && tplSheet.rows === 1 && tplSheet.name === '界面模板' && tplSheet.meta.indexOf('项') >= 0, tplSheet);
await evaluate('document.querySelector("#sheet [data-act=apply]").click(); "ok"');
await sleep(1100);
const appliedUi = await evaluate("(async function () { const st = await import('./js/store.js'); const D = window.__D; const rows = st.getState().todos.filter(function (t) { return t.date >= D.nextWeek[0] && t.date <= D.nextWeek[6]; }); return { sheetGone: !document.querySelector('#sheet .sheet-title'), count: rows.length, texts: rows.map(function (t) { return t.text; }), durations: Array.from(document.querySelectorAll('.plan-duration')).map(function (x) { return x.textContent.trim(); }) }; })()", true);
check('套用模板后下一周出现任务',
  appliedUi && appliedUi.sheetGone && appliedUi.count >= 3
    && appliedUi.texts.indexOf('本周数学') >= 0 && appliedUi.texts.indexOf('本周英语') >= 0 && appliedUi.texts.indexOf('界面任务') >= 0, appliedUi);
check('套用后保留预计时长徽标',
  appliedUi && appliedUi.durations.some(function (x) { return x.indexOf('45分') >= 0; }) && appliedUi.durations.some(function (x) { return x.indexOf('30分') >= 0; }), appliedUi);

/* 删除模板（界面确认） */
await evaluate('document.querySelector("[data-act=tpl-open]").click(); "ok"');
await sleep(500);
await evaluate('document.querySelector("#sheet [data-tpl] [data-act=del]").click(); "ok"');
await sleep(500);
const confirmView = await evaluate("(function () { return { title: document.querySelector('#sheet .sheet-title') ? document.querySelector('#sheet .sheet-title').textContent.trim() : '', hasYes: !!document.querySelector('#sheet [data-act=yes]') }; })()");
check('删除模板弹出确认', confirmView && confirmView.title === '删除计划模板' && confirmView.hasYes, confirmView);
await evaluate('document.querySelector("#sheet [data-act=yes]").click(); "ok"');
await sleep(800);
const afterDel = await evaluate("(async function () { const st = await import('./js/store.js'); return { count: st.getPlanTemplates().length }; })()", true);
check('界面删除模板成功', afterDel && afterDel.count === 0, afterDel);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result35.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
