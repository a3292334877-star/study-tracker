/* test29：v1.28 学习洞察
   静态：store 聚合 API / 新页面 / 路由 / 入口 / 样式 / 版本
   数据：30 天与 90 天汇总、活跃率、平均单次、最佳单日、最长连续、时段/星期峰值、科目占比、标签、环比
   界面：洞察页渲染、范围切换、空态、统计页入口、我的页入口
   用法：node _tools/test29.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8149 / 9390） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8149);
const DBG = Number(process.env.ST_DBG || 9390);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const appSrc = read('js/app.js');
const statsSrc = read('js/views/stats.js');
const meSrc = read('js/views/me.js');
const insightSrc = read('js/views/insights.js');
const indexSrc = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 洞察聚合 API',
  storeSrc.includes('export function insightsSummary')
    && storeSrc.includes('hourBars')
    && storeSrc.includes('weekdayBars')
    && storeSrc.includes('bestStreak')
    && storeSrc.includes('deltaPct'), true);
check('新页面与路由接入',
  appSrc.includes("import { renderInsights } from './views/insights.js'")
    && appSrc.includes('insights: renderInsights')
    && insightSrc.includes('export function renderInsights')
    && insightSrc.includes('昼夜节律')
    && insightSrc.includes('一周节奏')
    && insightSrc.includes('科目结构')
    && insightSrc.includes('给你的观察'), true);
check('统计页 / 我的页 / 样式清单',
  statsSrc.includes('data-act="insights"')
    && meSrc.includes('data-act="insights"')
    && indexSrc.includes('css/parts/insights.css')
    && swSrc.includes('./js/views/insights.js')
    && swSrc.includes('./css/parts/insights.css'), true);
check('版本：sw v34 / manifest 28-1.29 / 页脚 v1.30',
  swSrc.includes("const CACHE = 'study-tracker-v35';")
    && manifestXml.includes('android:versionCode="29"')
    && manifestXml.includes('android:versionName="1.30"')
    && meSrc.includes('学习记录 v1.30'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile29-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result29.json'), JSON.stringify({ results }, null, 2));
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

const seeded = await evaluate(
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444' }); const eng = st.addSubject({ name: '英语', emoji: '📖', color: '#3b82f6' }); const at = (ago, hour) => { const d = new Date(); d.setDate(d.getDate() - ago); d.setHours(hour, 0, 0, 0); return d.getTime(); }; const mk = (sub, ago, hour, min, title, tags) => st.addSession({ subjectId: sub.id, end: at(ago, hour), minutes: min, title: title, tags: tags }); mk(math, 0, 9, 30, '极限', ['复习']); mk(math, 0, 14, 60, '导数', ['复习']); mk(eng, 1, 20, 45, '阅读', ['阅读']); mk(eng, 10, 14, 25, '单词', []); mk(math, 40, 20, 90, '积分', []); mk(eng, 50, 14, 30, '听力', []); mk(math, 70, 9, 20, '线代', []); mk(math, 120, 20, 120, '概率', []); return { sessions: st.getState().sessions.length }; })()",
  true
);
check('种子：8 条跨周期记录', seeded && seeded.sessions === 8, seeded);

const s30 = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const s = st.insightsSummary(30); return { minutes: s.minutes, count: s.count, activeDays: s.activeDays, activeRate: s.activeRate, avgSession: s.avgSession, avgActiveDay: s.avgActiveDay, bestDay: s.bestDay, bestStreak: s.bestStreak, peakHour: s.peakHour, peakWeekday: s.peakWeekday, top: s.subjects[0] && { name: s.subjects[0].name, pct: s.subjects[0].pct }, subjects: s.subjects.length, tags: s.tags.map((t) => t.tag + ':' + t.count), prev: s.prevMinutes, delta: s.deltaPct, hourLen: s.hourBars.length, weekLen: s.weekdayBars.length }; })()",
  true
);
check('30 天汇总：160 分钟 / 4 条 / 3 个活跃日', s30 && s30.minutes === 160 && s30.count === 4 && s30.activeDays === 3, s30);
check('活跃率与平均值', s30 && s30.activeRate === 10 && s30.avgSession === 40 && s30.avgActiveDay === 53, s30);
check('最佳单日与最长连续', s30 && s30.bestDay && s30.bestDay.minutes === 90 && s30.bestDay.count === 2 && s30.bestStreak === 2, s30);
check('时段峰值 13 点 / 星期峰值有效', s30 && s30.peakHour === 13 && s30.peakWeekday >= 0 && s30.peakWeekday <= 6 && s30.hourLen === 24 && s30.weekLen === 7, s30);
check('科目占比：数学 56%', s30 && s30.subjects === 2 && s30.top && s30.top.name === '数学' && s30.top.pct === 56, s30);
check('标签统计', s30 && s30.tags.includes('复习:2') && s30.tags.includes('阅读:1'), s30);
check('与前一周期对比 +33%', s30 && s30.prev === 120 && s30.delta === 33, s30);

const s90 = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const s = st.insightsSummary(90); return { minutes: s.minutes, count: s.count, activeDays: s.activeDays, prev: s.prevMinutes, delta: s.deltaPct }; })()",
  true
);
check('90 天汇总包含更早记录', s90 && s90.minutes === 300 && s90.count === 7 && s90.activeDays === 6 && s90.prev === 120 && s90.delta === 150, s90);

await evaluate('location.hash = "#/insights?range=30"; "ok"');
await sleep(900);
const page = await evaluate("(() => { const hero = document.querySelector('.insights-hero-main b'); const tabs = document.querySelectorAll('.insights-range [data-range]'); const on = document.querySelector('.insights-range [data-range].on'); return { hero: hero ? hero.textContent.trim() : '', tabs: tabs.length, on: on ? on.textContent.trim() : '', stats: document.querySelectorAll('.insights-stat-grid .stat').length, hours: document.querySelectorAll('.chart-hours .chart-col').length, week: document.querySelectorAll('.chart-week .chart-col').length, subjects: document.querySelectorAll('.bars .bar-line').length, tags: document.querySelectorAll('.insight-tag').length, observations: document.querySelectorAll('.insight-observe li').length, observeText: document.querySelector('.insight-observe') ? document.querySelector('.insight-observe').textContent.replace(/\s+/g, ' ') : '' }; })()");
check('洞察页 hero 与范围', page && page.hero === '2h40m' && page.tabs === 3 && page.on === '近 30 天' && page.stats === 4, page);
check('24 小时 / 7 天图表', page && page.hours === 24 && page.week === 7, page);
check('科目与标签区块', page && page.subjects >= 2 && page.tags === 2, page);
check('自动观察包含时长', page && page.observations >= 4 && page.observeText.indexOf('2h40m') >= 0, page);

await evaluate("document.querySelectorAll('[data-range]')[1].click(); 'ok'");
await sleep(900);
const switched = await evaluate("(() => { const hero = document.querySelector('.insights-hero-main b'); const on = document.querySelector('.insights-range [data-range].on'); return { hash: location.hash, hero: hero ? hero.textContent.trim() : '', on: on ? on.textContent.trim() : '' }; })()");
check('切换到近 90 天', switched && switched.hash.indexOf('range=90') >= 0 && switched.hero === '5h' && switched.on === '近 90 天', switched);

await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); return true; })()", true);
await evaluate('location.hash = "#/insights?range=30"; "ok"');
await sleep(900);
const empty = await evaluate("(() => ({ empty: !!document.querySelector('#insights-empty'), text: document.querySelector('#insights-empty') ? document.querySelector('#insights-empty').textContent.replace(/\s+/g, ' ').trim() : '' }))()");
check('空态提示去记一笔', empty && empty.empty && empty.text.indexOf('还没有学习记录') >= 0, empty);

await evaluate('location.hash = "#/stats"; "ok"');
await sleep(900);
const statsEntry = await evaluate("(() => { const btn = document.querySelector('[data-act=insights]'); return { exists: !!btn, text: btn ? btn.textContent.trim() : '', card: !!document.querySelector('#insights-card') }; })()");
check('统计页洞察入口', statsEntry && statsEntry.card && statsEntry.exists && statsEntry.text.indexOf('打开学习洞察') >= 0, statsEntry);
await evaluate("document.querySelector('[data-act=insights]').click(); 'ok'");
await sleep(900);
const statsJump = await evaluate("location.hash");
check('统计页入口跳转洞察', typeof statsJump === 'string' && statsJump.indexOf('#/insights?range=30') >= 0, statsJump);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const meEntry = await evaluate("(() => { const row = document.querySelector('[data-act=insights]'); return { exists: !!row, text: row ? row.textContent.replace(/\s+/g, ' ').trim() : '' }; })()");
check('我的页工具入口', meEntry && meEntry.exists && meEntry.text.indexOf('学习洞察') >= 0, meEntry);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result29.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
