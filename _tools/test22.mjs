/* test22：v1.21 笔记回顾（间隔复习）
   静态：store 回顾 API / state.memory、#/memory 路由、首页与我的入口、样式与 sw 资产、版本
   数据：到期判断、回顾队列、标记回顾顺延、localStorage 持久化
   界面：首页待回顾数量、回顾页首条卡片、点「想起来了」后清空、我的入口与页脚
   用法：node _tools/test22.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8142 / 9383） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8142);
const DBG = Number(process.env.ST_DBG || 9383);
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
const memSrc = read('js/views/memory.js');
const memCss = read('css/parts/memory.css');
const indexHtml = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 笔记回顾 API 与 state.memory',
  storeSrc.includes('export const REVIEW_INTERVALS = [1, 3, 7, 15, 30, 60, 120, 240]')
    && storeSrc.includes('export function reviewInfo')
    && storeSrc.includes('export function reviewQueue')
    && storeSrc.includes('export function reviewNoteList')
    && storeSrc.includes('export function reviewStats')
    && storeSrc.includes('export function markReviewed')
    && storeSrc.includes('export function hasReviewNote')
    && storeSrc.includes('memory: {}'), true);
check('回顾视图 / 路由 / 首页与我的入口',
  exists('js/views/memory.js')
    && memSrc.includes('export function renderMemory')
    && memSrc.includes('markReviewed')
    && appSrc.includes("import { renderMemory } from './views/memory.js'")
    && appSrc.includes('memory: renderMemory')
    && homeSrc.includes('data-go-memory')
    && homeSrc.includes('reviewStats')
    && meSrc.includes('data-act="memory"'), true);
check('样式与 SW 资产登记',
  memCss.includes('.memory-card') && memCss.includes('.memory-item')
    && indexHtml.includes('css/parts/memory.css')
    && swSrc.includes("./css/parts/memory.css")
    && swSrc.includes("./js/views/memory.js"), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v31';")
    && manifestXml.includes('android:versionCode="25"') && manifestXml.includes('android:versionName="1.26"')
    && meSrc.includes('学习记录 v1.26'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile22-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result22.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const now = Date.now(); const a = st.addSession({ subjectId: math.id, end: now, minutes: 30, title: '今日笔记', note: '今天刚记，明天才回顾' }); const b = st.addSession({ subjectId: math.id, end: now - 2 * 86400000, minutes: 40, title: '旧笔记', note: '两天前的心得' }); const c = st.addSession({ subjectId: math.id, end: now - 3 * 86400000, minutes: 20, title: '没有心得', note: '' }); return { math: math.id, a: a.id, b: b.id, c: c.id }; })()", true);
await evaluate('window.__S = ' + JSON.stringify(seed) + '; "ok"');
check('种子：一条今日笔记 / 一条两天前笔记 / 一条无心得', seed && seed.math && seed.a && seed.b && seed.c, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const s = window.__S; const stats = st.reviewStats(); const queue = st.reviewQueue(); const list = st.reviewNoteList(); const hasA = st.hasReviewNote(st.getSession(s.a)); const hasC = st.hasReviewNote(st.getSession(s.c)); const marked = st.markReviewed(s.b); const stats2 = st.reviewStats(); const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); return { total: stats.totalNotes, due: stats.due, queueTitles: queue.map((x) => x.session.title), listLen: list.length, hasA: hasA, hasC: hasC, markedCount: marked && marked.count, markedDue: marked && marked.due, markedInterval: marked && marked.intervalDays, due2: stats2.due, reviewedTotal: stats2.reviewedTotal, raw: raw.memory && raw.memory[s.b] }; })()", true);
check('到期判断：只有两天前的笔记进队列',
  data && data.total === 2 && data.due === 1 && data.queueTitles.length === 1 && data.queueTitles[0] === '旧笔记' && data.listLen === 2, data);
check('有心得才进回顾，无心得排除', data && data.hasA === true && data.hasC === false, data);
check('标记回顾后次数 +1、间隔跳到 3 天、不再到期',
  data && data.markedCount === 1 && data.markedDue === false && data.markedInterval === 3 && data.due2 === 0 && data.reviewedTotal === 1, data);
check('回顾进度写入 localStorage', data && data.raw && data.raw.count === 1 && data.raw.lastAt > 0, data && data.raw);

const eId = await evaluate("(async () => { const st = await import('./js/store.js'); const s = window.__S; const now = Date.now(); const x = st.addSession({ subjectId: s.math, end: now - 5 * 86400000, minutes: 25, title: '五天前的心得', note: '五天前的笔记内容' }); return x.id; })()", true);
await evaluate('window.__S.e = ' + JSON.stringify(eId) + '; "ok"');
const dueNow = await evaluate("(async () => { const st = await import('./js/store.js'); return st.reviewStats().due; })()", true);
check('新增旧笔记后今天有 1 条待回顾', dueNow === 1, dueNow);

await evaluate('location.hash = "#/home"; "ok"');
await sleep(900);
const home = await evaluate("(() => { const row = document.querySelector('[data-go-memory]'); return { found: !!row, sub: row ? row.querySelector('.row-sub').textContent.trim() : '', val: row ? row.querySelector('.row-val').textContent.trim() : '' }; })()");
check('首页笔记回顾入口显示待回顾数量', home && home.found && home.sub.indexOf('1 条笔记今天该回顾') >= 0 && home.val.indexOf('1') >= 0, home);

await evaluate("document.querySelector('[data-go-memory]').click(); 'ok'");
await sleep(1000);
const page = await evaluate("(() => { const card = document.querySelector('.memory-card'); return { route: location.hash, hero: document.querySelector('.memory-hero .hero-value b') ? document.querySelector('.memory-hero .hero-value b').textContent.trim() : '', title: card ? card.querySelector('.memory-title').textContent.trim() : '', note: card ? card.querySelector('.memory-note').textContent.trim() : '', mark: !!(card && card.querySelector('[data-mark]')), items: document.querySelectorAll('.memory-item').length, sub: document.querySelector('#page-title').textContent.trim() }; })()");
check('回顾页显示第 1 条到期笔记与完整心得',
  page && page.route === '#/memory' && page.hero === '1' && page.title === '五天前的心得' && page.note.indexOf('五天前的笔记内容') >= 0 && page.mark && page.items === 3 && page.sub === '笔记回顾', page);

await evaluate("document.querySelector('[data-mark]').click(); 'ok'");
await sleep(1100);
const after = await evaluate("(() => { const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const empty = document.querySelector('.memory-empty'); return { hero: document.querySelector('.memory-hero .hero-value b') ? document.querySelector('.memory-hero .hero-value b').textContent.trim() : '', empty: !!empty, emptyText: empty ? empty.textContent.replace(/\s+/g, ' ').trim() : '', items: document.querySelectorAll('.memory-item').length, saved: raw.memory && raw.memory[window.__S.e] }; })()");
check('点「想起来了」后今日清空并显示完成态',
  after && after.hero === '0' && after.empty && after.emptyText.indexOf('今天的笔记都回顾完了') >= 0 && after.items === 3, after);
check('界面操作同样写入回顾次数', after && after.saved && after.saved.count === 1, after && after.saved);

await evaluate('location.hash = "#/home"; "ok"');
await sleep(900);
const homeDone = await evaluate("(() => { const row = document.querySelector('[data-go-memory]'); return { sub: row ? row.querySelector('.row-sub').textContent.trim() : '', val: row ? row.querySelector('.row-val').textContent.trim() : '' }; })()");
check('首页回顾完成后文案切换', homeDone && homeDone.sub.indexOf('今天的回顾已完成') >= 0, homeDone);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => { return { entry: !!document.querySelector('[data-act=\"memory\"]'), footer: document.body.innerText.indexOf('学习记录 v1.26') >= 0 }; })()");
check('我的页有笔记回顾入口与 v1.21 页脚', me && me.entry && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result22.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
