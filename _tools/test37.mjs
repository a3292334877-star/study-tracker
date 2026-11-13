/* test37：v1.35 任务中心批量处理（多选完成 / 顺延 / 删除 + 一键顺延全部逾期）
   静态：store 批量 API / 视图批量入口 / 样式 / 版本
   界面：进入批量模式、单选与全选、批量完成、批量顺延、批量删除（普通与重复任务）、切筛选自动退出、一键顺延全部逾期
   用法：node _tools/test37.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8161 / 9402） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8161);
const DBG = Number(process.env.ST_DBG || 9402);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const todosSrc = read('js/views/todos.js');
const cssSrc = read('css/parts/todos.css');
const swSrc = read('sw.js');
const meSrc = read('js/views/me.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 提供 v1.35 任务批量 API',
  ['completeTodoOccurrences', 'rescheduleTodoOccurrences', 'removeTodoOccurrences'].every((n) => storeSrc.includes('export function ' + n))
    && /export function completeTodoOccurrences[\s\S]{0,900}commit\(\)/.test(storeSrc), true);
check('任务中心接入批量模式与一键顺延',
  todosSrc.includes('todo-batch-bar') && todosSrc.includes('todo-batch-all')
    && todosSrc.includes('todo-batch-complete') && todosSrc.includes('todo-batch-snooze')
    && todosSrc.includes('todo-batch-del') && todosSrc.includes('data-act="snooze-all"')
    && todosSrc.includes('completeTodoOccurrences') && todosSrc.includes('rescheduleTodoOccurrences')
    && todosSrc.includes('removeTodoOccurrences'), true);
check('任务中心批量样式',
  cssSrc.includes('#todos-body.selecting .todo-task') && cssSrc.includes('.todo-pick')
    && cssSrc.includes('.todo-batch-bar') && cssSrc.includes('.todo-tools'), true);
check('版本：sw v42 / manifest 36-1.36 / 页脚 v1.36',
  swSrc.includes("const CACHE = 'study-tracker-v42';")
    && manifestXml.includes('android:versionCode="36"')
    && manifestXml.includes('android:versionName="1.36"')
    && meSrc.includes('学习记录 v1.36'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile37-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result37.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.kill(); edge.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
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
  '(async () => {'
  + ' const st = await import("./js/store.js"); st.resetAll();'
  + ' const s1 = st.addSubject({ name: "数学", emoji: "📐" });'
  + ' const s2 = st.addSubject({ name: "英语", emoji: "📖" });'
  + ' const now = new Date(); const dk = (n) => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return st.dateKey(x); };'
  + ' const today = dk(0), y1 = dk(-1), y2 = dk(-2), tm = dk(1);'
  + ' const a = st.addTodo("逾期A", y1, "none", s1.id); st.setTodoMinutes(a.id, 30);'
  + ' const b = st.addTodo("逾期B", y2, "none", s2.id);'
  + ' const g = st.addTodo("逾期C", y1, "none", s1.id);'
  + ' const c = st.addTodo("今天任务", today, "none", s1.id);'
  + ' const d = st.addTodo("每天背词", today, "daily", s2.id);'
  + ' const e = st.addTodo("未来任务", tm, "none", s2.id);'
  + ' const f = st.addTodo("已完成任务", today, "none", s1.id); st.setTodoDone(f.id, today, true);'
  + ' return { today: today, y1: y1, y2: y2, tm: tm, ids: { a: a.id, b: b.id, g: g.id, c: c.id, d: d.id, e: e.id, f: f.id }, subj: { math: s1.id, en: s2.id } };'
  + '})()',
  true
);
check('种子数据就绪', seed && seed.ids && seed.ids.a && seed.ids.d && seed.ids.f, seed);

await evaluate('location.hash = "#/todos"; "ok"');
await sleep(1000);

const initial = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), barHidden: document.querySelector("#todo-batch-bar").hidden, selecting: document.querySelector("#todos-body").classList.contains("selecting"), picks: document.querySelectorAll(".todo-pick").length, titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('默认 6 项待办且批量条隐藏', initial && initial.count === '共 6 项待办' && initial.barHidden === true && initial.selecting === false && initial.picks === 0, initial);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); return "ok"; })()');
await sleep(400);
const entered = await evaluate('(function(){ return { hidden: document.querySelector("#todo-batch-bar").hidden, selecting: document.querySelector("#todos-body").classList.contains("selecting"), picks: document.querySelectorAll(".todo-pick").length, pressed: document.querySelector("#todo-batch").getAttribute("aria-pressed") }; })()');
check('进入批量模式显示操作条与勾选圈', entered && entered.hidden === false && entered.selecting === true && entered.picks === 6 && entered.pressed === 'true', entered);

await evaluate('(function(){ document.querySelector("[data-id=\\"' + seed.ids.a + '\\"]").click(); document.querySelector("[data-id=\\"' + seed.ids.b + '\\"]").click(); return "ok"; })()');
await sleep(300);
const selectedTwo = await evaluate('(function(){ return { count: document.querySelector("#todo-batch-count").textContent.trim(), picked: document.querySelectorAll(".todo-task.picked").length, completeDisabled: document.querySelector("#todo-batch-complete").disabled, snoozeDisabled: document.querySelector("#todo-batch-snooze").disabled, delDisabled: document.querySelector("#todo-batch-del").disabled }; })()');
check('点击任务行可多选并启用批量操作', selectedTwo && selectedTwo.count === '已选 2 项' && selectedTwo.picked === 2 && selectedTwo.completeDisabled === false && selectedTwo.snoozeDisabled === false && selectedTwo.delDisabled === false, selectedTwo);

await evaluate('(function(){ document.querySelector("#todo-batch-complete").click(); return "ok"; })()');
await sleep(800);
const completed = await evaluate('(async function(){ const st = await import("./js/store.js"); const a = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.a + '"; }); const b = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.b + '"; }); return { count: document.querySelector("#todo-count").textContent.trim(), barHidden: document.querySelector("#todo-batch-bar").hidden, aDone: Boolean(a && a.done), bDone: Boolean(b && b.done) }; })()', true);
check('批量标记完成生效且退出选择模式', completed && completed.aDone && completed.bDone && completed.count === '共 4 项待办' && completed.barHidden === true, completed);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); return "ok"; })()');
await sleep(300);
await evaluate('(function(){ document.querySelector("#todo-batch-all").click(); return "ok"; })()');
await sleep(300);
const allSelected = await evaluate('(function(){ return { count: document.querySelector("#todo-batch-count").textContent.trim(), picked: document.querySelectorAll(".todo-task.picked").length }; })()');
check('全选选中当前筛选下全部任务', allSelected && allSelected.count === '已选 4 项' && allSelected.picked === 4, allSelected);
await evaluate('(function(){ document.querySelector("#todo-batch-exit").click(); return "ok"; })()');
await sleep(300);
const exited = await evaluate('(function(){ return { hidden: document.querySelector("#todo-batch-bar").hidden, picks: document.querySelectorAll(".todo-pick").length, pressed: document.querySelector("#todo-batch").getAttribute("aria-pressed") }; })()');
check('退出批量模式收起操作条与勾选圈', exited && exited.hidden === true && exited.picks === 0 && exited.pressed === 'false', exited);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); document.querySelector("[data-id=\\"' + seed.ids.g + '\\"]").click(); document.querySelector("#todo-batch-snooze").click(); return "ok"; })()');
await sleep(800);
const snoozed = await evaluate('(async function(){ const st = await import("./js/store.js"); const g = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.g + '"; }); const row = document.querySelector("[data-id=\\"' + seed.ids.g + '\\"]"); return { date: g ? g.date : "", occ: row ? row.dataset.occ : "", count: document.querySelector("#todo-count").textContent.trim(), barHidden: document.querySelector("#todo-batch-bar").hidden }; })()', true);
check('批量顺延逾期任务到今天', snoozed && snoozed.date === seed.today && snoozed.occ === seed.today && snoozed.count === '共 4 项待办' && snoozed.barHidden === true, snoozed);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); document.querySelector("[data-id=\\"' + seed.ids.e + '\\"]").click(); document.querySelector("#todo-batch-del").click(); return "ok"; })()');
await sleep(500);
const delSheet = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { title: s ? s.querySelector(".sheet-title").textContent.trim() : "", visible: s ? !s.hidden : false }; })()');
check('批量删除先弹确认框', delSheet && delSheet.visible && delSheet.title.indexOf('删除这 1 项任务') >= 0, delSheet);
await evaluate('(function(){ document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(800);
const deleted = await evaluate('(async function(){ const st = await import("./js/store.js"); const e = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.e + '"; }); return { gone: !e, count: document.querySelector("#todo-count").textContent.trim(), barHidden: document.querySelector("#todo-batch-bar").hidden }; })()', true);
check('批量删除普通任务生效', deleted && deleted.gone && deleted.count === '共 3 项待办' && deleted.barHidden === true, deleted);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); document.querySelector("[data-id=\\"' + seed.ids.d + '\\"]").click(); document.querySelector("#todo-batch-del").click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(800);
const repeatDeleted = await evaluate('(async function(){ const st = await import("./js/store.js"); const d = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.d + '"; }); return { exists: Boolean(d), skipped: Boolean(d && Array.isArray(d.skipDates) && d.skipDates.indexOf("' + seed.today + '") >= 0), count: document.querySelector("#todo-count").textContent.trim() }; })()', true);
check('批量删除重复任务只跳过当天', repeatDeleted && repeatDeleted.exists && repeatDeleted.skipped && repeatDeleted.count === '共 3 项待办', repeatDeleted);

await evaluate('(function(){ document.querySelector("#todo-batch").click(); document.querySelector("[data-id=\\"' + seed.ids.c + '\\"]").click(); document.querySelector("[data-filter=done]").click(); return "ok"; })()');
await sleep(400);
const filterExit = await evaluate('(function(){ return { hidden: document.querySelector("#todo-batch-bar").hidden, selecting: document.querySelector("#todos-body").classList.contains("selecting"), clear: document.querySelectorAll(".todo-task.picked").length }; })()');
check('切换筛选自动退出批量模式', filterExit && filterExit.hidden === true && filterExit.selecting === false && filterExit.clear === 0, filterExit);
await evaluate('(function(){ document.querySelector("[data-filter=pending]").click(); return "ok"; })()');
await sleep(300);

/* 一键顺延全部逾期：重新种子两条逾期任务并重新渲染 */
await evaluate(
  '(async function(){ const st = await import("./js/store.js"); st.resetAll();'
  + ' const s = st.addSubject({ name: "数学", emoji: "📐" }); const now = new Date(); const dk = (n) => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return st.dateKey(x); };'
  + ' st.addTodo("逾期X", dk(-1), "none", s.id); st.addTodo("逾期Y", dk(-3), "none", s.id);'
  + ' return "ok"; })()', true);
await evaluate('location.hash = "#/home"; "ok"');
await sleep(300);
await evaluate('location.hash = "#/todos"; "ok"');
await sleep(900);
const snoozeAllBtn = await evaluate('(function(){ const b = document.querySelector("[data-act=snooze-all]"); return { exists: Boolean(b), text: b ? b.textContent.trim() : "" }; })()');
check('有逾期时显示一键顺延入口', snoozeAllBtn && snoozeAllBtn.exists && snoozeAllBtn.text.indexOf('顺延全部逾期') >= 0, snoozeAllBtn);
await evaluate('(function(){ document.querySelector("[data-act=snooze-all]").click(); return "ok"; })()');
await sleep(500);
const snoozeAllSheet = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { title: s ? s.querySelector(".sheet-title").textContent.trim() : "", desc: s ? s.querySelector(".sheet-desc").textContent.trim() : "" }; })()');
check('一键顺延弹确认框', snoozeAllSheet && snoozeAllSheet.title.indexOf('顺延全部逾期任务') >= 0, snoozeAllSheet);
await evaluate('(function(){ document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(900);
const allSnoozed = await evaluate('(async function(){ const st = await import("./js/store.js"); const today = st.dateKey(new Date()); const list = st.getState().todos; return { count: document.querySelector("#todo-count").textContent.trim(), allToday: list.every(function(t){ return t.date === today; }), n: list.length }; })()', true);
check('一键顺延把全部逾期任务移到今天', allSnoozed && allSnoozed.n === 2 && allSnoozed.allToday && allSnoozed.count === '共 2 项待办', allSnoozed);

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result37.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
try { ws.close(); } catch (_) {}
server.kill(); edge.kill();
process.exit(failed.length ? 1 : 0);
