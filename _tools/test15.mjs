/* test15：v1.14 年度回顾（#/review 年度总结页 + 年度海报）
   1) 静态：store.yearSummary / review 视图 / app 路由 / 统计页入口 / 版本号
   2) 数据：yearSummary 的年度汇总、月度、科目、标签、连续与最佳单日
   3) 界面：年度页数据与月柱、年份切换、空态、年度海报 Canvas
   用法：node _tools/test15.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8135 / 9376） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8135);
const DBG = Number(process.env.ST_DBG || 9376);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const reviewSrc = read('js/views/review.js');
const appSrc = read('js/app.js');
const statsSrc = read('js/views/stats.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 年度汇总函数',
  storeSrc.includes('export function yearSummary') && storeSrc.includes('byMonth')
    && storeSrc.includes('bestMonth') && storeSrc.includes('peakHour'), true);
check('年度回顾视图',
  reviewSrc.includes('export function renderReview') && reviewSrc.includes('export function yearlyText')
    && reviewSrc.includes('id="year-label"') && reviewSrc.includes('data-act="year-poster"')
    && reviewSrc.includes('drawYearPoster'), true);
check('路由与统计页入口',
  appSrc.includes("import { renderReview }") && appSrc.includes('review: renderReview')
    && statsSrc.includes('data-act="year-review"'), true);
check('版本：sw v28 / manifest 22-1.23 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v39';")
    && manifestXml.includes('android:versionCode="33"') && manifestXml.includes('android:versionName="1.33"')
    && meSrc.includes('学习记录 v1.33'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile15-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result15.json'), JSON.stringify({ results }, null, 2));
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

/* ---------- 3. 种子数据（2026 + 2025 各一年） ---------- */
const seed = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  st.resetAll();
  const s1 = st.addSubject({ name: '数学', emoji: '📐', color: '#4f6df5' });
  const s2 = st.addSubject({ name: '英语', emoji: '📘', color: '#12b76a' });
  const add = (subjectId, y, mo, d, h, mi, minutes, tags) => {
    const start = new Date(y, mo, d, h, mi).getTime();
    st.addSession({ subjectId, start, end: start + minutes * 60000, minutes, tags, title: '学习' });
  };
  add(s1.id, 2026, 0, 3, 10, 0, 60, ['重点']);
  add(s2.id, 2026, 2, 8, 14, 0, 120, ['复习']);
  add(s1.id, 2026, 2, 9, 20, 0, 30, ['重点']);
  add(s1.id, 2026, 4, 15, 20, 0, 90, []);
  add(s2.id, 2026, 10, 10, 19, 0, 45, ['复习']);
  add(s1.id, 2025, 11, 31, 22, 0, 30, []);
  return { subjects: st.getState().subjects.length, sessions: st.getState().sessions.length };
})()`, true);
check('种子数据写入', seed && seed.subjects === 2 && seed.sessions === 6, seed);

/* ---------- 4. yearSummary 纯数据 ---------- */
const y2026 = await evaluate(`(async () => { const st = await import('./js/store.js'); return st.yearSummary(2026); })()`, true);
check('2026 年度汇总数值',
  y2026 && y2026.totalMin === 345 && y2026.count === 5 && y2026.activeDays === 5
    && y2026.longest === 2 && y2026.byMonth.length === 12 && y2026.byMonth[2].min === 150
    && y2026.bestMonth === 2 && y2026.peakHour === 20
    && y2026.subjects.length === 2 && y2026.subjects[0].name === '数学' && y2026.subjects[0].min === 180
    && y2026.tags.some((t) => t.name === '重点'), y2026);
check('最佳单日与记录跨度',
  y2026 && y2026.bestDay && y2026.bestDay.key === '2026-03-08' && y2026.bestDay.min === 120
    && y2026.firstKey === '2026-01-03' && y2026.lastKey === '2026-11-10', y2026 && { bestDay: y2026.bestDay, firstKey: y2026.firstKey, lastKey: y2026.lastKey });

const y2025 = await evaluate(`(async () => { const st = await import('./js/store.js'); return st.yearSummary(2025); })()`, true);
check('2025 年度汇总', y2025 && y2025.totalMin === 30 && y2025.count === 1 && y2025.byMonth[11].min === 30, y2025);

/* ---------- 5. 年度回顾页面 ---------- */
await evaluate('location.hash = "#/review?year=2026"; "ok"');
await sleep(900);
const ui = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    label: q('#year-label') ? q('#year-label').textContent : '',
    total: q('#review-total') ? q('#review-total').textContent.replace(/\s+/g, '') : '',
    sub: q('#review-sub') ? q('#review-sub').textContent : '',
    months: document.querySelectorAll('#month-chart .chart-col').length,
    subjects: document.querySelectorAll('#review-subjects .bar-line').length,
    miles: document.querySelectorAll('#mile-list .mile').length,
    nextDisabled: q('[data-year-step="1"]') ? q('[data-year-step="1"]').disabled : null,
  };
})()`);
check('年度页主数据与月柱',
  ui && ui.label === '2026' && ui.total === '5小时45分'
    && /5 条记录/.test(ui.sub) && /5 天/.test(ui.sub)
    && ui.months === 12 && ui.subjects === 2 && ui.miles === 4 && ui.nextDisabled === true, ui);

const prevNav = await evaluate(`(() => { const b = document.querySelector('[data-year-step="-1"]'); if (b) b.click(); return true; })()`);
await sleep(900);
const ui2025 = await evaluate(`(() => ({ hash: location.hash, label: document.querySelector('#year-label') ? document.querySelector('#year-label').textContent : '', total: document.querySelector('#review-total') ? document.querySelector('#review-total').textContent.replace(/\s+/g, '') : '' }))()`);
check('切换到 2025 年', ui2025 && /year=2025/.test(ui2025.hash) && ui2025.label === '2025' && ui2025.total === '30分钟', ui2025);

await evaluate('location.hash = "#/review?year=2024"; "ok"');
await sleep(800);
const empty = await evaluate(`(() => { const e = document.querySelector('.empty'); return { text: e ? e.textContent.replace(/\s+/g, '') : '', hasAdd: !!document.querySelector('[data-act="add"]') }; })()`);
check('空年份空态', empty && empty.text.includes('2024') && empty.text.includes('还没有学习记录') && empty.hasAdd === false, empty);

/* ---------- 6. 年度海报 ---------- */
await evaluate('location.hash = "#/review?year=2026"; "ok"');
await sleep(800);
await evaluate('document.querySelector("[data-act=\\"year-poster\\"]").click(); "ok"');
await sleep(600);
const poster = await evaluate(`(() => {
  const s = document.querySelector('#sheet');
  const c = s && s.querySelector('#year-canvas');
  const dataUrl = c ? c.toDataURL('image/png') : '';
  const title = s ? (s.querySelector('.sheet-title') ? s.querySelector('.sheet-title').textContent : '') : '';
  const cancel = s && s.querySelector('[data-act="cancel"]');
  if (cancel) cancel.click();
  return { hasSheet: !!s, w: c ? c.width : 0, h: c ? c.height : 0, len: dataUrl.length, title };
})()`);
check('年度海报 Canvas 生成', poster && poster.hasSheet && poster.w > 500 && poster.h > poster.w && poster.len > 5000 && /年度回顾海报/.test(poster.title), poster);
await sleep(400);

/* ---------- 7. 文字版总结 ---------- */
const text = await evaluate(`(async () => { const r = await import('./js/views/review.js'); const st = await import('./js/store.js'); return r.yearlyText(st.yearSummary(2026)); })()`, true);
if (typeof text !== 'string') console.log('TEXT RAW', JSON.stringify(text));
check('年度文字总结', typeof text === 'string' && text.includes('2026') && text.includes('5h45m') && text.includes('数学') && text.includes('#重点'), typeof text === 'string' ? text.slice(0, 200) : text);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));

/* ---------- 收尾 ---------- */
ws.close();
edge.kill();
server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result15.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);