/* test36：v1.34 任务中心二期（按科目筛选 + 任务编辑与改期）
   静态：store API / 视图接入 / 样式 / 版本
   界面：科目筛选、搜索叠加、编辑任务内容/科目/时长、普通任务改期、重复任务只改这一次
   用法：node _tools/test36.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8159 / 9400） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8159);
const DBG = Number(process.env.ST_DBG || 9400);
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

check('store 提供 v1.34 任务编辑 / 改期 API',
  storeSrc.includes('export function getTodo') && storeSrc.includes('export function updateTodo')
    && storeSrc.includes('export function rescheduleTodoOccurrence'), true);
check('任务中心接入科目筛选与编辑入口',
  todosSrc.includes('data-subject') && todosSrc.includes('openEditTodoSheet')
    && todosSrc.includes('data-act="edit"') && todosSrc.includes('rescheduleTodoOccurrence'), true);
check('任务中心样式包含科目筛选与编辑按钮',
  cssSrc.includes('.todo-subjects') && cssSrc.includes('.todo-more'), true);
check('版本：sw v42 / manifest 36-1.36 / 页脚 v1.36',
  swSrc.includes("const CACHE = 'study-tracker-v42';")
    && manifestXml.includes('android:versionCode="36"')
    && manifestXml.includes('android:versionName="1.36"')
    && meSrc.includes('学习记录 v1.36'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile36-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result36.json'), JSON.stringify({ results }, null, 2));
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
  + ' const s1 = st.addSubject({ name: "数学", emoji: "📐" });'
  + ' const s2 = st.addSubject({ name: "英语", emoji: "📖" });'
  + ' const now = new Date(); const dk = (n) => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return st.dateKey(x); };'
  + ' const today = dk(0), tm = dk(1);'
  + ' const a = st.addTodo("数学作业", today, "none", s1.id); st.setTodoMinutes(a.id, 45);'
  + ' const b = st.addTodo("英语听力", today, "none", s2.id);'
  + ' const c = st.addTodo("数学复习", tm, "none", s1.id);'
  + ' const d = st.addTodo("每天背词", today, "daily", s2.id);'
  + ' return { today: today, tm: tm, ids: { a: a.id, b: b.id, c: c.id, d: d.id }, subj: { math: s1.id, en: s2.id } };'
  + '})()',
  true
);
check('种子数据就绪', seed && seed.ids && seed.ids.a && seed.ids.d, seed);

await evaluate('location.hash = "#/todos"; "ok"');
await sleep(1000);

const initial = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }), chips: Array.from(document.querySelectorAll("#todo-subjects [data-subject]")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('默认显示 4 项待办', initial && initial.count === '共 4 项待办' && initial.titles.length === 4, initial);
check('科目筛选 chips 显示全部科目', initial && initial.chips[0] === '全部科目' && initial.chips.some(function(x){ return x.indexOf('数学') >= 0; }) && initial.chips.some(function(x){ return x.indexOf('英语') >= 0; }), initial && initial.chips);

await evaluate('(function(){ document.querySelector("[data-subject=\\"' + seed.subj.math + '\\"]").click(); return "ok"; })()');
await sleep(500);
const mathView = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('按科目筛选只显示该科目任务', mathView && mathView.count === '共 2 项待办' && mathView.titles.indexOf('数学作业') >= 0 && mathView.titles.indexOf('数学复习') >= 0 && mathView.titles.indexOf('英语听力') < 0, mathView);

await evaluate('(function(){ const q = document.querySelector("#todo-q"); q.value = "复习"; q.dispatchEvent(new Event("input", { bubbles: true })); return "ok"; })()');
await sleep(500);
const combo = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), titles: Array.from(document.querySelectorAll(".todo-task .plan-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('科目筛选与搜索可叠加', combo && combo.count === '共 1 项待办' && combo.titles.length === 1 && combo.titles[0] === '数学复习', combo);
await evaluate('(function(){ document.querySelector("#todo-clr").click(); return "ok"; })()');
await sleep(400);
const cleared = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim(), value: document.querySelector("#todo-q").value }; })()');
check('清除搜索后保留科目筛选', cleared && cleared.count === '共 2 项待办' && cleared.value === '', cleared);
await evaluate('(function(){ document.querySelector("[data-subject=\\"\\"]").click(); return "ok"; })()');
await sleep(500);
const allBack = await evaluate('(function(){ return { count: document.querySelector("#todo-count").textContent.trim() }; })()');
check('切回全部科目恢复 4 项', allBack && allBack.count === '共 4 项待办', allBack);

/* 编辑普通任务：内容 / 科目 / 时长 */
await evaluate('(function(){ const row = document.querySelector("[data-id=\\"' + seed.ids.a + '\\"]"); row.querySelector("[data-act=edit]").click(); return "ok"; })()');
await sleep(500);
const editOpen = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { title: s ? s.querySelector(".sheet-title").textContent.trim() : "", text: s && s.querySelector("#todo-edit-text") ? s.querySelector("#todo-edit-text").value : "", date: s && s.querySelector("#todo-edit-date") ? s.querySelector("#todo-edit-date").value : "", mathOn: Boolean(s && s.querySelector("[data-edit-subject=\\"' + seed.subj.math + '\\"]") && s.querySelector("[data-edit-subject=\\"' + seed.subj.math + '\\"]").classList.contains("on")), min45On: Boolean(s && s.querySelector("[data-edit-min=\\"45\\"]") && s.querySelector("[data-edit-min=\\"45\\"]").classList.contains("on")) }; })()');
check('编辑弹层预填内容 / 日期 / 科目 / 时长', editOpen && editOpen.title === '编辑任务' && editOpen.text === '数学作业' && editOpen.date === todayKey && editOpen.mathOn && editOpen.min45On, editOpen);

await evaluate('(function(){ const s = document.querySelector("#sheet"); s.querySelector("#todo-edit-text").value = "数学作业改"; s.querySelector("[data-edit-subject=\\"' + seed.subj.en + '\\"]").click(); s.querySelector("[data-edit-min=\\"30\\"]").click(); s.querySelector("[data-act=yes]").click(); return "ok"; })()');
await sleep(900);
const edited = await evaluate('(async function(){ const st = await import("./js/store.js"); const t = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.a + '"; }); const row = document.querySelector("[data-id=\\"' + seed.ids.a + '\\"]"); return { text: t ? t.text : "", subjectId: t ? t.subjectId : "", minutes: t ? t.minutes : 0, rowText: row ? row.querySelector(".plan-title").textContent.trim() : "", sheetGone: !document.querySelector("#sheet") || document.querySelector("#sheet").hidden }; })()', true);
check('编辑保存后内容 / 科目 / 时长都更新', edited && edited.text === '数学作业改' && edited.subjectId === seed.subj.en && edited.minutes === 30 && edited.rowText === '数学作业改', edited);

/* 普通任务改期到明天 */
await evaluate('(function(){ const row = document.querySelector("[data-id=\\"' + seed.ids.b + '\\"]"); row.querySelector("[data-act=edit]").click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ const s = document.querySelector("#sheet"); s.querySelector("#todo-edit-date").value = "' + seed.tm + '"; s.querySelector("[data-act=yes]").click(); return "ok"; })()');
await sleep(900);
const moved = await evaluate('(async function(){ const st = await import("./js/store.js"); const t = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.b + '"; }); const row = document.querySelector("[data-id=\\"' + seed.ids.b + '\\"]"); return { date: t ? t.date : "", occ: row ? row.dataset.occ : "", same: t ? t.date === "' + seed.tm + '" : false }; })()', true);
check('普通任务可改期到指定日期', moved && moved.same && moved.occ === seed.tm, moved);

/* 重复任务改期：只调整这一次 */
await evaluate('(function(){ const row = document.querySelector("[data-id=\\"' + seed.ids.d + '\\"]"); row.querySelector("[data-act=edit]").click(); return "ok"; })()');
await sleep(500);
const repeatSheet = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { desc: s ? s.querySelector(".sheet-desc").textContent : "", date: s && s.querySelector("#todo-edit-date") ? s.querySelector("#todo-edit-date").value : "" }; })()');
check('重复任务编辑弹层提示只改这一次', repeatSheet && repeatSheet.desc.indexOf('只调整这一次') >= 0 && repeatSheet.date === todayKey, repeatSheet);
await evaluate('(function(){ const s = document.querySelector("#sheet"); s.querySelector("#todo-edit-date").value = "' + seed.tm + '"; s.querySelector("[data-act=yes]").click(); return "ok"; })()');
await sleep(900);
const repeatMoved = await evaluate('(async function(){ const st = await import("./js/store.js"); const t = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.d + '"; }); const moved = st.getState().todos.find(function(x){ return x.movedFrom === "' + seed.ids.d + '"; }); return { skip: t && Array.isArray(t.skipDates) ? t.skipDates.indexOf("' + todayKey + '") >= 0 : false, moved: Boolean(moved), movedDate: moved ? moved.date : "", movedRepeat: moved ? moved.repeat : "" }; })()', true);
check('重复任务改期只跳过当天并新建一条普通任务', repeatMoved && repeatMoved.skip && repeatMoved.moved && repeatMoved.movedDate === seed.tm && repeatMoved.movedRepeat === 'none', repeatMoved);

/* store 校验 */
const storeGuards = await evaluate('(async function(){ const st = await import("./js/store.js"); const blank = st.updateTodo("' + seed.ids.c + '", { text: "   " }); const copy = st.getTodo("' + seed.ids.c + '"); const original = st.getState().todos.find(function(x){ return x.id === "' + seed.ids.c + '"; }); if (copy) copy.text = "副本"; return { blankNull: blank === null, copyIsolated: original && original.text === "数学复习", tooMany: st.updateTodo("' + seed.ids.c + '", { minutes: 99999 }) ? st.getState().todos.find(function(x){ return x.id === "' + seed.ids.c + '"; }).minutes : -1, badMove: st.rescheduleTodoOccurrence("' + seed.ids.c + '", "bad", "also-bad") === false }; })()', true);
check('store 校验：空标题拒绝 / 副本隔离 / 时长上限 / 非法改期', storeGuards && storeGuards.blankNull && storeGuards.copyIsolated && storeGuards.tooMany === 1440 && storeGuards.badMove, storeGuards);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result36.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
