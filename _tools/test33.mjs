/* test33：v1.31 常用模板管理
   静态：store API / 路由 / 我的入口 / 表单入口 / 样式 / 版本
   界面：列表渲染、编辑、一键使用预填、新建、删除、清空
   用法：node _tools/test33.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8154 / 9395） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8154);
const DBG = Number(process.env.ST_DBG || 9395);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const appSrc = read('js/app.js');
const meSrc = read('js/views/me.js');
const sheetSrc = read('js/sheets.js');
const htmlSrc = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 提供模板编辑 / 清空 API',
  storeSrc.includes('export function updateTemplate') && storeSrc.includes('export function clearTemplates'), true);
check('注册 #/templates 路由与模板视图',
  appSrc.includes("import { renderTemplates } from './views/templates.js'") && appSrc.includes('templates: renderTemplates'), true);
check('我的页有常用模板入口',
  meSrc.includes('data-act="template-manage"') && meSrc.includes("ctx.go('#/templates')"), true);
check('记一笔表单有「管理模板」入口',
  sheetSrc.includes('data-act="tpl-manage"') && sheetSrc.includes("location.hash = '#/templates'"), true);
check('模板样式表已接入 index.html',
  htmlSrc.includes('css/parts/templates.css'), true);
check('版本：sw v38 / manifest 32-1.32 / 页脚 v1.32',
  swSrc.includes("const CACHE = 'study-tracker-v43';")
    && manifestXml.includes('android:versionCode="37"')
    && manifestXml.includes('android:versionName="1.37"')
    && meSrc.includes('学习记录 v1.37'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile33-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result33.json'), JSON.stringify({ results }, null, 2));
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

await evaluate(
  '(async () => { const st = await import("./js/store.js"); st.resetAll(); const s = st.addSubject({ name: "算法" }); st.addTemplate({ subjectId: s.id, title: "二叉树遍历", minutes: 45, tags: ["复习", "重点"] }); st.addTemplate({ subjectId: s.id, title: "英语单词", minutes: 20, tags: ["单词"] }); return st.getTemplates().length; })()',
  true
);
await evaluate('location.hash = "#/templates"; "ok"');
await sleep(1200);

const page = await evaluate('(function(){ const cards = Array.from(document.querySelectorAll(".tpl-card")); return { title: document.querySelector("#page-title").textContent.trim(), count: cards.length, titles: cards.map(function(c){ return c.querySelector(".tpl-title").textContent.trim(); }), text: cards.map(function(c){ return c.textContent; }).join(" ") }; })()');
check('模板管理页可打开且标题正确', page && page.title === '常用模板', page);
check('列出全部 2 条模板', page && page.count === 2 && page.titles.indexOf('二叉树遍历') >= 0 && page.titles.indexOf('英语单词') >= 0, page);
check('模板卡显示科目 / 时长 / 标签', page && page.text.indexOf('算法') >= 0 && page.text.indexOf('45分') >= 0 && page.text.indexOf('#复习') >= 0, page && page.text);

await evaluate('(function(){ const cards = Array.from(document.querySelectorAll(".tpl-card")); const card = cards.find(function(c){ return c.querySelector(".tpl-title").textContent.trim() === "二叉树遍历"; }); card.querySelector("[data-edit]").click(); return "ok"; })()');
await sleep(500);
const editOpen = await evaluate('(function(){ const title = document.querySelector("#sheet #te-title"); return { open: Boolean(title), value: title ? title.value : "" }; })()');
check('点编辑打开模板编辑弹层并带出原值', editOpen && editOpen.open && editOpen.value === '二叉树遍历', editOpen);
await evaluate('(function(){ const input = document.querySelector("#sheet #te-title"); input.value = "二叉树遍历（改）"; document.querySelector("#sheet [data-act=te-save]").click(); return "ok"; })()');
await sleep(700);
const edited = await evaluate('(async function(){ const st = await import("./js/store.js"); const t = st.getTemplates().find(function(x){ return x.title === "二叉树遍历（改）"; }); return { found: Boolean(t), card: Array.from(document.querySelectorAll(".tpl-title")).some(function(x){ return x.textContent.trim() === "二叉树遍历（改）"; }) }; })()', true);
check('保存编辑后模板标题更新', edited && edited.found && edited.card, edited);

await evaluate('(function(){ const cards = Array.from(document.querySelectorAll(".tpl-card")); const card = cards.find(function(c){ return c.querySelector(".tpl-title").textContent.trim() === "英语单词"; }); card.querySelector("[data-use]").click(); return "ok"; })()');
await sleep(500);
const prefilled = await evaluate('(function(){ const t = document.querySelector("#sheet #r-title"); const m = document.querySelector("#sheet #r-minutes"); return { open: Boolean(t), title: t ? t.value : "", min: m ? m.value : "" }; })()');
check('一键使用会打开记一笔并预填模板内容', prefilled && prefilled.open && prefilled.title === '英语单词' && prefilled.min === '20', prefilled);
await evaluate('(function(){ const cancel = document.querySelector("#sheet [data-act=cancel]"); if (cancel) cancel.click(); else if (window.closeSheet) window.closeSheet(); return "ok"; })()');
await sleep(500);

await evaluate('(function(){ document.querySelector("[data-new]").click(); return "ok"; })()');
await sleep(400);
await evaluate('(function(){ const input = document.querySelector("#sheet #te-title"); input.value = "线性代数"; const min = document.querySelector("#sheet #te-min"); min.value = "30"; document.querySelector("#sheet [data-act=te-save]").click(); return "ok"; })()');
await sleep(700);
const added = await evaluate('(function(){ return { count: document.querySelectorAll(".tpl-card").length, titles: Array.from(document.querySelectorAll(".tpl-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('新建模板后列表增加', added && added.count === 3 && added.titles.indexOf('线性代数') >= 0, added);

await evaluate('(function(){ const cards = Array.from(document.querySelectorAll(".tpl-card")); const card = cards.find(function(c){ return c.querySelector(".tpl-title").textContent.trim() === "英语单词"; }); card.querySelector("[data-del]").click(); return "ok"; })()');
await sleep(400);
await evaluate('(function(){ document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(600);
const deleted = await evaluate('(function(){ return { count: document.querySelectorAll(".tpl-card").length, titles: Array.from(document.querySelectorAll(".tpl-title")).map(function(x){ return x.textContent.trim(); }) }; })()');
check('删除单条模板', deleted && deleted.count === 2 && deleted.titles.indexOf('英语单词') < 0, deleted);

await evaluate('(function(){ document.querySelector("[data-clear]").click(); return "ok"; })()');
await sleep(400);
await evaluate('(function(){ document.querySelector("#sheet [data-act=yes]").click(); return "ok"; })()');
await sleep(700);
const cleared = await evaluate('(async function(){ const st = await import("./js/store.js"); return { count: document.querySelectorAll(".tpl-card").length, empty: Boolean(document.querySelector(".tpl-empty")), store: st.getTemplates().length }; })()', true);
check('清空全部模板并显示空状态', cleared && cleared.count === 0 && cleared.empty && cleared.store === 0, cleared);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result33.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
