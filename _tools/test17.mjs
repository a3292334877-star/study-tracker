/* test17：v1.16 学习日历（#/calendar 12 个月日历 + 年份切换 + 点天回看）
   1) 静态：store.calendarYear / calendar 视图 / app 路由 / 统计入口 / 版本号
   2) 数据：年度汇总、12 个月天数、每日 level、闰年 2 月
   3) 界面：年度英雄数字、日历格子、点天弹层、年份切换、空年、统计页入口
   用法：node _tools/test17.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8137 / 9378） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8137);
const DBG = Number(process.env.ST_DBG || 9378);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const calSrc = read('js/views/calendar.js');
const appSrc = read('js/app.js');
const statsSrc = read('js/views/stats.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const indexHtml = read('index.html');
const calCss = read('css/parts/calendar.css');

check('store 学习日历数据函数',
  storeSrc.includes('export function calendarYear')
    && storeSrc.includes('bestDay') && storeSrc.includes('bestMonth') && storeSrc.includes('maxDayMin'), true);
check('日历视图与样式',
  calSrc.includes('export function renderCalendar')
    && calSrc.includes('data-day') && calSrc.includes('cal-month')
    && calCss.includes('.cal-months') && calCss.includes('.cal-cell.lv4'), true);
check('日历路由与统计页入口',
  appSrc.includes("import { renderCalendar }") && appSrc.includes('calendar: renderCalendar')
    && statsSrc.includes('id="calendar-card"') && statsSrc.includes('data-act="calendar"'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24 / 资源',
  swSrc.includes("const CACHE = 'study-tracker-v37';")
    && manifestXml.includes('android:versionCode="31"') && manifestXml.includes('android:versionName="1.31"')
    && meSrc.includes('学习记录 v1.31')
    && swSrc.includes('./js/views/calendar.js') && swSrc.includes('./css/parts/calendar.css')
    && indexHtml.includes('css/parts/calendar.css'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile17-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result17.json'), JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.kill(); edge.kill();
  process.exit(1);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; } if (m.method === 'Runtime.exceptionThrown') { logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); } };
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => pend.set(i, { resolve: res, reject: rej })); };
const evaluate = async (expr, aw = false) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: aw, userGesture: true }); if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description }; return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

/* ---------- 3. 种子数据：2026 年 6 条记录 + 2025 一条 ---------- */
const seed = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  st.resetAll();
  const a = st.addSubject({ name: '数学', emoji: '📐', color: '#4f6df5' });
  const b = st.addSubject({ name: '英语', emoji: '📘', color: '#12b76a' });
  const add = (subjectId, y, mo, d, h, mi, minutes, title) => {
    const start = new Date(y, mo, d, h, mi).getTime();
    st.addSession({ subjectId, start, end: start + minutes * 60000, minutes, tags: [], title });
  };
  add(a.id, 2026, 0, 5, 9, 0, 60, '极限');
  add(a.id, 2026, 0, 6, 9, 0, 30, '导数');
  add(a.id, 2026, 0, 20, 14, 0, 90, '积分');
  add(b.id, 2026, 1, 10, 20, 0, 120, '阅读');
  add(b.id, 2026, 1, 11, 20, 0, 15, '单词');
  add(a.id, 2026, 2, 1, 10, 0, 45, '线代');
  add(b.id, 2025, 11, 31, 21, 0, 50, '旧年');
  return { subjects: st.getState().subjects.length, sessions: st.getState().sessions.length };
})()`, true);
check('种子数据写入', seed && seed.subjects === 2 && seed.sessions === 7, seed);

/* ---------- 4. calendarYear 纯数据 ---------- */
const d = await evaluate(`(async () => { const st = await import('./js/store.js'); return st.calendarYear(2026); })()`, true);
check('年度汇总（360 分 / 6 条 / 6 天 / 最长 2 天）',
  d && d.totalMin === 360 && d.count === 6 && d.activeDays === 6 && d.longest === 2 && d.maxDayMin === 120,
  d && { totalMin: d.totalMin, count: d.count, activeDays: d.activeDays, longest: d.longest, maxDayMin: d.maxDayMin });
check('最佳单日与最活跃月份',
  d && d.bestDay && d.bestDay.key === '2026-02-10' && d.bestDay.min === 120 && d.bestMonth === 0,
  d && { bestDay: d.bestDay, bestMonth: d.bestMonth });
check('12 个月与天数（1 月 31 / 2 月 28）',
  d && d.months.length === 12 && d.months[0].days.length === 31 && d.months[1].days.length === 28 && d.months[11].days.length === 31,
  d && d.months.map((m) => m.days.length).join(','));
check('月度合计与每日 level',
  d && d.months[0].totalMin === 180 && d.months[1].totalMin === 135 && d.months[2].totalMin === 45
    && d.months[0].days.find((x) => x.day === 5).level === 2
    && d.months[0].days.find((x) => x.day === 6).level === 1
    && d.months[0].days.find((x) => x.day === 20).level === 3
    && d.months[1].days.find((x) => x.day === 10).level === 4, d && d.months.slice(0, 3).map((m) => m.totalMin));
const leap = await evaluate(`(async () => { const st = await import('./js/store.js'); return st.calendarYear(2024); })()`, true);
check('闰年 2 月 29 天与空年', leap && leap.months[1].days.length === 29 && leap.totalMin === 0 && leap.count === 0, leap && { feb: leap.months[1].days.length, total: leap.totalMin });

/* ---------- 5. 日历页面 ---------- */
await evaluate('location.hash = "#/calendar"; "ok"');
await sleep(900);
const ui = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    title: document.title,
    year: q('#cal-year') ? q('#cal-year').textContent : '',
    hero: q('#cal-total') ? q('#cal-total').textContent.replace(/\\s+/g, '') : '',
    sub: q('#cal-sub') ? q('#cal-sub').textContent.replace(/\\s+/g, '') : '',
    facts: Array.from(document.querySelectorAll('.cal-fact b')).map((x) => x.textContent),
    months: document.querySelectorAll('.cal-month').length,
    days: document.querySelectorAll('.cal-cell[data-day]').length,
    janTotal: q('[data-month="1"] .cal-month-total') ? q('[data-month="1"] .cal-month-total').textContent : '',
    jan5: q('[data-day="2026-01-05"]') ? q('[data-day="2026-01-05"]').className : '',
    feb10: q('[data-day="2026-02-10"]') ? q('[data-day="2026-02-10"]').className : '',
    zero: q('[data-day="2026-01-01"]') ? q('[data-day="2026-01-01"]').className : '',
  };
})()`);
check('日历页标题与英雄数字',
  ui && /学习日历/.test(ui.title) && ui.year === '2026' && ui.hero === '6小时'
    && ui.sub === '6条记录·6天有记录·最长连续2天' && ui.facts.join(',') === '6,6,1 月', ui);
check('12 个月与 365 个日格',
  ui && ui.months === 12 && ui.days === 365 && ui.janTotal === '3h', ui && { months: ui.months, days: ui.days, janTotal: ui.janTotal });
check('日历颜色层级',
  ui && /lv2/.test(ui.jan5) && /lv4/.test(ui.feb10) && /lv0/.test(ui.zero), ui && { jan5: ui.jan5, feb10: ui.feb10, zero: ui.zero });

/* ---------- 6. 点某天看当天记录 ---------- */
await evaluate('document.querySelector(\'[data-day="2026-01-05"]\').click(); "ok"');
await sleep(500);
const daySheet = await evaluate(`(() => {
  const s = document.querySelector('#sheet');
  const title = s && s.querySelector('.sheet-title') ? s.querySelector('.sheet-title').textContent : '';
  const desc = s && s.querySelector('.sheet-desc') ? s.querySelector('.sheet-desc').textContent : '';
  const rows = s ? s.querySelectorAll('[data-session]').length : 0;
  const close = s && s.querySelector('[data-act="close"]');
  if (close) close.click();
  return { title, desc, rows };
})()`);
check('点天打开当天记录弹层',
  daySheet && daySheet.title === '1月5日' && /2026-01-05/.test(daySheet.desc) && /1 条记录/.test(daySheet.desc) && /1h/.test(daySheet.desc) && daySheet.rows === 1, daySheet);
await sleep(350);

/* ---------- 7. 年份切换与空年 ---------- */
await evaluate('document.querySelector(\'[data-year-step="-1"]\').click(); "ok"');
await sleep(700);
const y2025 = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return { year: q('#cal-year') ? q('#cal-year').textContent : '', hero: q('#cal-total') ? q('#cal-total').textContent.replace(/\\s+/g, '') : '', empty: !!q('#cal-empty') };
})()`);
check('切到 2025 年', y2025 && y2025.year === '2025' && y2025.hero === '50分钟' && y2025.empty === false, y2025);
await evaluate('document.querySelector(\'[data-year-step="-1"]\').click(); "ok"');
await sleep(700);
const y2024 = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return { year: q('#cal-year') ? q('#cal-year').textContent : '', hero: q('#cal-total') ? q('#cal-total').textContent.replace(/\\s+/g, '') : '', empty: q('#cal-empty') ? q('#cal-empty').textContent : '', months: document.querySelectorAll('.cal-month').length };
})()`);
check('空年份提示', y2024 && y2024.year === '2024' && y2024.hero === '0分钟' && /还没有学习记录/.test(y2024.empty) && y2024.months === 12, y2024);

/* ---------- 8. 统计页入口 ---------- */
await evaluate('location.hash = "#/stats"; "ok"');
await sleep(800);
const entry = await evaluate(`(() => {
  const card = document.querySelector('#calendar-card');
  const btn = document.querySelector('[data-act="calendar"]');
  return { hasCard: !!card, hasBtn: !!btn, text: card ? card.textContent.replace(/\\s+/g, '') : '' };
})()`);
check('统计页学习日历入口', entry && entry.hasCard && entry.hasBtn && entry.text.includes('学习日历') && entry.text.includes('打开学习日历'), entry);
await evaluate('document.querySelector(\'[data-act="calendar"]\').click(); "ok"');
await sleep(700);
const back = await evaluate('({ hash: location.hash, year: document.querySelector(\'#cal-year\') ? document.querySelector(\'#cal-year\').textContent : "" })');
check('入口打开今年日历', back && back.hash === '#/calendar?year=2026' && back.year === '2026', back);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));

/* ---------- 收尾 ---------- */
ws.close();
edge.kill();
server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result17.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
