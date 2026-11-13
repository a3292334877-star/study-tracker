/* test34：v1.32 任务中心
   静态：store API / 路由 / 我的入口 / 首页逾期入口 / 样式与 sw / 版本
   界面：待办列表、逾期标记、顺延、已完成、搜索、添加、删除、重复任务跳过、首页入口
   用法：node _tools/test34.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8156 / 9397） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8156);
const DBG = Number(process.env.ST_DBG || 9397);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const appSrc = read('js/app.js');
const meSrc = read('js/views/me.js');
const homeSrc = read('js/views/home.js');
const todosSrc = read('js/views/todos.js');
const htmlSrc = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 提供任务中心 API',
  storeSrc.includes('export function taskOccurrences') && storeSrc.includes('export function nextTodoOccurrences')
    && storeSrc.includes('export function overdueTodos') && storeSrc.includes('export function rescheduleTodo')
    && storeSrc.includes('export function todoOverview'), true);
check('注册 #/todos 路由与任务中心视图',
  appSrc.includes("import { renderTodos } from './views/todos.js'") && appSrc.includes('todos: renderTodos'), true);
check('我的页有任务中心入口',
  meSrc.includes('data-act="todos"') && meSrc.includes("ctx.go('#/todos')"), true);
check('首页有逾期任务入口',
  homeSrc.includes('data-go-todos') && homeSrc.includes("ctx.go('#/todos')"), true);
check('任务中心样式与 sw 资源已接入',
  htmlSrc.includes('css/parts/todos.css') && swSrc.includes('./css/parts/todos.css') && swSrc.includes('./js/views/todos.js'), true);
check('版本：sw v38 / manifest 32-1.32 / 页脚 v1.32',
  swSrc.includes("const CACHE = 'study-tracker-v38';")
    && manifestXml.includes('android:versionCode="32"')
    && manifestXml.includes('android:versionName="1.32"')
    && meSrc.includes('学习记录 v1.32'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile34-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result34.json'), JSON.stringify({ results }, null, 2));
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

const todayKey = await evaluate('(async () => { const st = await import("./js/store.js"); return st.dateKey(new Date()); })()', true);
const seed = await evaluate(
  '(async () => {'
  + ' const st = await import("./js/store.js"); st.resetAll();'
  + ' const s = st.addSubject({ name: "数学" });'
  + ' const now = new Date(); const dk = (n) => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return st.dateKey(x); };'
  + ' const past = dk(-3), today = dk(0), tm = dk(1);'
  + ' const a = st.addTodo("三天前没做完的事", past, "none", s.id);'
  + ' const b = st.addTodo("今天要背单词", today, "none", s.id);'
  + ' const c = st.addTodo("明天做真题", tm, "none", s.id);'
  + ' const e = st.addTodo("每天跑步", today, "daily", null);'
  + ' const f = st.addTodo("今天已完成的事", today, "none", s.id);'
  + ' st.setTodoDone(f.id, today, true);'
  + ' return { past: past, today: today, tm: tm, ids: [a.id, b.id, c.id, e.id, f.id] };'
  + '})()',
  true
);
check('种子数据就绪', seed && seed.ids && seed.ids.length === 5, seed);

/* 首页逾期入口 */
await evaluate('location.hash = "#/home"; "ok"');
await sleep(1000);
const homeEntry = await evaluate('(function(){ const el = document.querySelector(".todo-entry"); return { exists: Boolean(el), text: el ? el.textContent.replace(/\\s+/g, " ").trim() : "" }; })()');
check('首页展示逾期任务入口', homeEntry && homeEntry.exists && homeEntry.text.indexOf('1 项任务逾期') >= 0, homeEntry);
await evaluate('(function(){ document.querySelector("[data-go-todos]").click(); return "ok"; })()');
await sleep(1000);
const afterJump = await evaluate('(function(){ return { hash: location.hash, title: document.querySelector("#page-title").textContent.trim() }; })()');
check('首页入口可跳到任务中心', afterJump && afterJump.hash === '#/todos' && afterJump.title === '任务中心', afterJump);

const initial = await evaluate('(function(){ return { hero: document.querySelector(".hero-value b") ? document.querySelector(".hero-value b").textContent.trim() : "", count: document.querySelector("#todo-count").textContent.trim(), groups: document.querySelectorAll(".todo-group").length, text: document.querySelector("#todos-body").textContent.replace(/\\s+/g, " "), overdueBadge: Boolean(document.querySelector(".todo-overdue")), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('默认显示待办且今日待办数正确', initial && initial.hero === '2', initial && initial.hero);
check('待办列表包含逾期 / 今天 / 明天 / 重复任务', initial && initial.count === '共 4 项待办' && ['三天前没做完的事', '今天要背单词', '明天做真题', '每天跑步'].every(function(t){ return initial.titles.indexOf(t) >= 0; }), initial);
check('逾期任务显示逾期天数', initial && initial.overdueBadge && initial.text.indexOf('逾期 3 天') >= 0, initial && initial.text);

/* 已完成筛选 */
await evaluate('(function(){ document.querySelector("[data-filter=done]").click(); return "ok"; })()');
await sleep(500);
const doneView = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('已完成筛选正确', doneView && doneView.count === '共 1 项已完成' && doneView.titles.indexOf('今天已完成的事') >= 0 && doneView.titles.indexOf('今天要背单词') < 0, doneView);

/* 全部筛选 */
await evaluate('(function(){ document.querySelector("[data-filter=all]").click(); return "ok"; })()');
await sleep(500);
const allView = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), rows: document.querySelectorAll(".todo-task").length }; })()');
check('全部筛选合并待办与已完成', allView && allView.count === '共 5 项任务' && allView.rows === 5, allView);

/* 搜索 */
await evaluate('(function(){ document.querySelector("[data-filter=pending]").click(); const q = document.querySelector("#todo-q"); q.value = "单词"; q.dispatchEvent(new Event("input", { bubbles: true })); return "ok"; })()');
await sleep(500);
const searchView = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('搜索按任务内容过滤', searchView && searchView.count === '共 1 项待办' && searchView.titles.length === 1 && searchView.titles[0] === '今天要背单词', searchView);
await evaluate('(function(){ document.querySelector("#todo-clr").click(); return "ok"; })()');
await sleep(400);
const cleared = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), value: document.querySelector("#todo-q").value }; })()');
check('清除搜索恢复全部待办', cleared && cleared.count === '共 4 项待办' && cleared.value === '', cleared);

/* 逾期顺延到今天 */
await evaluate('(function(){ document.querySelector("[data-act=resched]").click(); return "ok"; })()');
await sleep(700);
const reschedStore = await evaluate('(async function(){ const st = await import("./js/store.js"); const s = st.getState(); const t = s.todos.find(function(x){ return x.text === "三天前没做完的事"; }); return { date: t ? t.date : "", badge: Boolean(document.querySelector(".todo-overdue")) }; })()', true);
check('逾期任务可一键顺延到今天', reschedStore && reschedStore.date === todayKey && reschedStore.badge === false, reschedStore);

/* 勾选明天任务完成 */
const tomorrowId = seed.ids[2];
await evaluate('(function(){ const row = document.querySelector("[data-id=\\"" + ' + JSON.stringify(tomorrowId) + ' + "\\"]"); row.querySelector("[data-act=toggle]").click(); return "ok"; })()');
await sleep(700);
const toggled = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('勾选任务后从待办移除', toggled && toggled.count === '共 3 项待办' && toggled.titles.indexOf('明天做真题') < 0, toggled);

/* 添加任务 */
await evaluate('(function(){ document.querySelector("[data-act=add]").click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ const input = document.querySelector("#sheet #prompt-input"); input.value = "新任务X"; document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(800);
const added = await evaluate('(async function(){ const st = await import("./js/store.js"); return { exists: st.getState().todos.some(function(x){ return x.text === "新任务X"; }), count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()', true);
check('任务中心可添加任务', added && added.exists && added.titles.indexOf('新任务X') >= 0, added);

/* 删除任务 */
await evaluate('(function(){ const rows = Array.from(document.querySelectorAll(".todo-task")); const row = rows.find(function(r){ return r.textContent.indexOf("新任务X") >= 0; }); row.querySelector("[data-act=del]").click(); return "ok"; })()');
await sleep(700);
const removed = await evaluate('(async function(){ const st = await import("./js/store.js"); return { exists: st.getState().todos.some(function(x){ return x.text === "新任务X"; }), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()', true);
check('任务中心可删除任务', removed && removed.exists === false && removed.titles.indexOf('新任务X') < 0, removed);

/* 重复任务跳过这天 */
await evaluate('(function(){ const rows = Array.from(document.querySelectorAll(".todo-task")); const row = rows.find(function(r){ return r.textContent.indexOf("每天跑步") >= 0; }); row.querySelector("[data-act=del]").click(); return "ok"; })()');
await sleep(500);
const repeatSheet = await evaluate('(function(){ const t = document.querySelector("#sheet .sheet-title"); return { title: t ? t.textContent.trim() : "" }; })()');
check('删除重复任务弹出确认', repeatSheet && repeatSheet.title === '重复任务', repeatSheet);
await evaluate('(function(){ document.querySelector("#sheet [data-act=skip]").click(); return "ok"; })()');
await sleep(700);
const skipped = await evaluate('(function(){ const rows = Array.from(document.querySelectorAll(".todo-task")); const row = rows.find(function(r){ return r.textContent.indexOf("每天跑步") >= 0; }); return { occ: row ? row.dataset.occ : "", exists: Boolean(row) }; })()');
check('重复任务跳过今天后顺延到明天', skipped && skipped.exists && skipped.occ > todayKey, skipped);

/* 回到首页：逾期处理后入口消失 */
await evaluate('location.hash = "#/home"; "ok"');
await sleep(900);
const homeAfter = await evaluate('(function(){ return { exists: Boolean(document.querySelector(".todo-entry")) }; })()');
check('逾期处理完首页入口消失', homeAfter && homeAfter.exists === false, homeAfter);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result34.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
