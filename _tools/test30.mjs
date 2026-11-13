/* test30：v1.29 学习周报
   静态：weekData 扩展 API / 新页面与路由 / 统计入口 / 样式与 SW 清单 / 版本
   数据：本周合计、活跃天数、7 天桶、最佳单日、时段峰值、标签、周目标与环比
   界面：周报页渲染、上一周切换、统计页入口、空态
   用法：node _tools/test30.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8151 / 9392） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8151);
const DBG = Number(process.env.ST_DBG || 9392);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const reportSrc = read('js/report.js');
const appSrc = read('js/app.js');
const statsSrc = read('js/views/stats.js');
const weeklySrc = read('js/views/weekly.js');
const meSrc = read('js/views/me.js');
const indexSrc = read('index.html');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const readme = read('README.md');

check('weekData 周报扩展 API',
  reportSrc.includes('daily') && reportSrc.includes('weeklyGoal') && reportSrc.includes('peakHour')
    && reportSrc.includes('bestDay') && reportSrc.includes('tags'), true);
check('新页面与路由接入',
  appSrc.includes("import { renderWeekly } from './views/weekly.js'")
    && appSrc.includes('weekly: renderWeekly')
    && weeklySrc.includes('export function renderWeekly')
    && weeklySrc.includes('本周学了什么')
    && weeklySrc.includes('本周小结'), true);
check('统计页入口 / 样式 / SW 预载',
  statsSrc.includes('data-act="weekly-report"')
    && indexSrc.includes('css/parts/weekly.css')
    && swSrc.includes('./js/views/weekly.js')
    && swSrc.includes('./css/parts/weekly.css'), true);
check('版本：sw v35 / manifest 29-1.30 / 页脚 v1.30',
  swSrc.includes("const CACHE = 'study-tracker-v43';")
    && manifestXml.includes('android:versionCode="37"')
    && manifestXml.includes('android:versionName="1.37"')
    && meSrc.includes('学习记录 v1.37'), true);
check('README v1.30 段与 versionCode 29',
  /^### v1\.30$/m.test(readme) && readme.includes('versionCode 29') && readme.includes('学习周报'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile30-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result30.json'), JSON.stringify({ results }, null, 2));
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
  "(async () => { const st = await import('./js/store.js'); st.resetAll(); st.setSetting('weeklyGoalMin', 90); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444', goalMinWeek: 100 }); const eng = st.addSubject({ name: '英语', emoji: '📖', color: '#3b82f6' }); const start = st.startOfWeek(new Date(), st.getState().settings.weekStart); const offset = (new Date().getDay() - st.getState().settings.weekStart + 7) % 7; const day = st.addDays(start, offset); const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.getTime(); }; const mk = (sub, end, min, title, tags) => st.addSession({ subjectId: sub.id, end: end, minutes: min, title: title, tags: tags }); mk(math, at(day, 10, 0), 60, '极限', ['复习']); mk(math, at(day, 15, 0), 30, '导数', ['复习']); mk(eng, at(st.addDays(start, -7), 20, 0), 45, '阅读', ['阅读']); mk(eng, at(st.addDays(start, -6), 14, 0), 25, '单词', []); return { sessions: st.getState().sessions.length, week: st.dateKey(start), today: st.dateKey(new Date()), offset: offset }; })()",
  true
);
check('种子：4 条记录（本周 2 / 上周 2）', seeded && seeded.sessions === 4, seeded);

const w = await evaluate(
  "(async () => { const st = await import('./js/store.js'); const ws = st.getState().settings.weekStart; const start = st.startOfWeek(new Date(), ws); const rp = await import('./js/report.js'); const d = rp.weekData(ws, start); const prev = rp.weekData(ws, st.addDays(start, -7)); return { totalMin: d.totalMin, count: d.count, activeDays: d.activeDays, dailyLen: d.daily.length, dailyMin: d.daily.reduce((n, x) => n + x.minutes, 0), best: d.bestDay, peakHour: d.peakHour, weeklyGoal: d.weeklyGoal, goalPct: d.goalPct, tags: d.tags.map((t) => t.name + ':' + t.count), prevMin: prev.totalMin, range: d.rangeText }; })()",
  true
);
check('本周合计 90 分钟 / 2 条 / 1 个活跃日', w && w.totalMin === 90 && w.count === 2 && w.activeDays === 1, w);
check('7 天桶与合计对齐', w && w.dailyLen === 7 && w.dailyMin === 90, w);
check('最佳单日与时段峰值', w && w.best && w.best.minutes === 90 && w.best.count === 2 && w.peakHour === 9, w);
check('周目标 90 分与 100%', w && w.weeklyGoal === 90 && w.goalPct === 100, w);
check('标签统计与上周对比', w && w.tags && w.tags.includes('复习:2') && w.prevMin === 70 && w.range.indexOf('月') >= 0, w);

await evaluate('location.hash = "#/weekly"; "ok"');
await sleep(1000);
const page = await evaluate("(() => { const total = document.querySelector('#week-total'); const days = document.querySelectorAll('.week-days .week-day'); const today = document.querySelector('.week-day.is-today'); const goal = document.querySelector('.week-goal-top b'); return { total: total ? total.textContent.replace(/\\s+/g, '') : '', delta: (document.querySelector('.month-delta') || {}).textContent || '', days: days.length, today: !!today, goal: goal ? goal.textContent.trim() : '', subjects: document.querySelectorAll('#week-subjects .bar-line').length, tags: document.querySelectorAll('#week-tags .month-tag').length, highlights: document.querySelectorAll('.week-highlights li').length, miles: document.querySelectorAll('.milestones .mile').length }; })()");
check('周报页 hero 与 7 天柱', page && page.total === '1小时30分' && page.days === 7 && page.today && page.delta.indexOf('+29%') >= 0, page);
check('周目标 / 科目 / 标签 / 主题 / 小结', page && page.goal === '100%' && page.subjects >= 1 && page.tags === 1 && page.highlights === 2 && page.miles === 4, page);

await evaluate(`document.querySelector('[data-week-step="-1"]').click(); 'ok'`);
await sleep(1000);
const prevPage = await evaluate("(() => { const total = document.querySelector('#week-total'); const delta = document.querySelector('.month-delta'); return { hash: location.hash, total: total ? total.textContent.replace(/\\s+/g, '') : '', delta: delta ? delta.textContent.trim() : '', currentBtn: !!document.querySelector('[data-week-current]') }; })()");
check('切换到上一周：1h10m 与回本周按钮', prevPage && prevPage.hash.indexOf('week=') >= 0 && prevPage.total === '1小时10分' && prevPage.currentBtn, prevPage);
await evaluate("document.querySelector('[data-week-current]').click(); 'ok'");
await sleep(800);

await evaluate('location.hash = "#/stats?range=week"; "ok"');
await sleep(1000);
const statsEntry = await evaluate("(() => { const btn = document.querySelector('[data-act=weekly-report]'); return { exists: !!btn, text: btn ? btn.textContent.trim() : '', card: !!document.querySelector('#report-card') }; })()");
check('统计页周报入口', statsEntry && statsEntry.card && statsEntry.exists && statsEntry.text.indexOf('查看完整周报') >= 0, statsEntry);
await evaluate("document.querySelector('[data-act=weekly-report]').click(); 'ok'");
await sleep(900);
const statsJump = await evaluate('location.hash');
check('统计页入口跳转周报', typeof statsJump === 'string' && statsJump.indexOf('#/weekly') >= 0, statsJump);

await evaluate('(async () => { const st = await import("./js/store.js"); st.resetAll(); return true; })()', true);
await evaluate('location.hash = "#/weekly"; "ok"');
await sleep(900);
const empty = await evaluate("(() => ({ empty: !!document.querySelector('#week-empty'), text: document.querySelector('#week-empty') ? document.querySelector('#week-empty').textContent.replace(/\\s+/g, ' ') : '' }))()");
check('空态提示去记一笔', empty && empty.empty && empty.text.indexOf('还没有学习记录') >= 0, empty);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result30.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
