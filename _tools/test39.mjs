/* test39：v1.37 统计页自定义时间范围
   静态：统计页自定义入口 / 弹层 / 快捷预设 / 环比口径 / 版本
   界面：默认本周、弹层默认值、近 30 天 / 上月预设、应用后统计数字、跨月区间、空结果、起止颠倒校验、URL 直达与非法回退
   用法：node _tools/test39.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8164 / 9405） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8164);
const DBG = Number(process.env.ST_DBG || 9405);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const statsSrc = read('js/views/stats.js');
const cssSrc = read('css/parts/log.css');
const swSrc = read('sw.js');
const meSrc = read('js/views/me.js');
const manifestXml = read('android/AndroidManifest.xml');

check('统计页提供自定义时间范围入口',
  statsSrc.includes("{ key: 'custom', label: '自定义' }")
    && statsSrc.includes('function openCustomRange()')
    && statsSrc.includes('readCustom(ctx.query)')
    && statsSrc.includes('data-preset="lastMonth"')
    && statsSrc.includes('data-preset="year"'), true);
check('统计页自定义弹层有开始 / 结束日期与校验',
  statsSrc.includes('id="stats-range-from"') && statsSrc.includes('id="stats-range-to"')
    && statsSrc.includes('近 30 天') && statsSrc.includes('上月') && statsSrc.includes('今年')
    && statsSrc.includes('开始日期不能晚于结束日期'), true);
check('自定义区间有独立环比口径（上一周期）',
  statsSrc.includes('curLabel = \'当前区间\'')
    && statsSrc.includes('prevLabel = \'上一周期\'')
    && statsSrc.includes('prevFrom = addDays(custom.fromD, -len)'), true);
check('自定义范围弹层复用范围样式',
  cssSrc.includes('.range-quick') && cssSrc.includes('.range-fields')
    && cssSrc.includes('grid-template-columns:1fr 1fr'), true);
check('版本：sw v44 / manifest 38-1.38 / 页脚 v1.38',
  swSrc.includes("const CACHE = 'study-tracker-v44';")
    && manifestXml.includes('android:versionCode="38"')
    && manifestXml.includes('android:versionName="1.38"')
    && meSrc.includes('学习记录 v1.38'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile39-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result39.json'), JSON.stringify({ results }, null, 2));
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
  + ' const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();'
  + ' const ts = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 20, 0, 0, 0).getTime();'
  + ' const d3 = new Date(y, m, now.getDate() - 3);'
  + ' const lm15 = new Date(y, m - 1, 15);'
  + ' const tm10 = new Date(y, m - 2, 10);'
  + ' const ly20 = new Date(y - 1, 11, 20);'
  + ' const add = (title, minutes, dt, sid) => st.addSession({ subjectId: sid, title: title, minutes: minutes, end: ts(dt) });'
  + ' add("今天记录", 10, now, s1.id);'
  + ' add("三天前记录", 20, d3, s2.id);'
  + ' add("上月记录", 30, lm15, s1.id);'
  + ' add("两月前记录", 40, tm10, s2.id);'
  + ' add("去年记录", 50, ly20, s1.id);'
  + ' return { today: st.dateKey(now), d3: st.dateKey(d3), lm15: st.dateKey(lm15), tm10: st.dateKey(tm10), ly20: st.dateKey(ly20), y: String(y), m: String(m + 1), math: s1.id, en: s2.id };'
  + '})()',
  true
);
check('种子数据就绪', seed && seed.today && seed.lm15 && seed.tm10 && seed.ly20, seed);

await evaluate('location.hash = "#/stats"; "ok"');
await sleep(1100);
const initial = await evaluate('(function(){ const seg = Array.from(document.querySelectorAll("#range-seg [data-range]")); return { hero: document.querySelector(".hero-label").textContent.trim(), ranges: seg.map(function(b){ return b.textContent.trim(); }), custom: document.querySelector("[data-range=custom]").getAttribute("aria-pressed"), cols: document.querySelector("#view .card .chart").querySelectorAll(".chart-col").length }; })()');
check('统计页默认本周并有四个范围入口', initial && initial.hero === '本周学习' && initial.ranges.join(',') === '本周,本月,全部,自定义' && initial.custom === 'false' && initial.cols === 7, initial);

await evaluate('(function(){ document.querySelector("[data-range=custom]").click(); return "ok"; })()');
await sleep(500);
const sheet = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { visible: s ? !s.hidden : false, title: s ? s.querySelector(".sheet-title").textContent.trim() : "", from: s ? s.querySelector("#stats-range-from").value : "", to: s ? s.querySelector("#stats-range-to").value : "", presets: s ? Array.from(s.querySelectorAll("[data-preset]")).map(function(b){ return b.textContent.trim(); }) : [] }; })()');
check('点自定义弹出日期范围弹层', sheet && sheet.visible && sheet.title === '自定义时间范围' && sheet.from && sheet.to && sheet.presets.join(',') === '近 30 天,上月,今年', sheet);

const preset30 = await evaluate('(function(){ document.querySelector("#sheet [data-preset=d30]").click(); return { from: document.querySelector("#stats-range-from").value, to: document.querySelector("#stats-range-to").value, on: document.querySelector("#sheet [data-preset=d30]").classList.contains("on") }; })()');
const d30expected = await evaluate('(function(){ const n = new Date(); const pad = function(x){ return String(x).padStart(2, "0"); }; const key = function(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }; const f = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29); return { from: key(f), to: key(n) }; })()');
check('近 30 天快捷预设填入正确日期', preset30 && preset30.from === d30expected.from && preset30.to === d30expected.to && preset30.on === true, { preset30: preset30, expected: d30expected });

const lastMonthPreset = await evaluate('(function(){ document.querySelector("#sheet [data-preset=lastMonth]").click(); return { from: document.querySelector("#stats-range-from").value, to: document.querySelector("#stats-range-to").value }; })()');
const lastMonthExpected = await evaluate('(function(){ const n = new Date(); const pad = function(x){ return String(x).padStart(2, "0"); }; const key = function(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }; const f = new Date(n.getFullYear(), n.getMonth() - 1, 1); const t = new Date(n.getFullYear(), n.getMonth(), 0); return { from: key(f), to: key(t), days: t.getDate() }; })()');
check('上月快捷预设覆盖上月整月', lastMonthPreset && lastMonthPreset.from === lastMonthExpected.from && lastMonthPreset.to === lastMonthExpected.to, { preset: lastMonthPreset, expected: lastMonthExpected });

await evaluate('(function(){ document.querySelector("#sheet [data-act=apply]").click(); return "ok"; })()');
await sleep(900);
const applied = await evaluate('(function(){ return { hash: location.hash, hero: document.querySelector(".hero-label").textContent.trim(), value: document.querySelector(".hero-value").textContent.trim(), record: document.querySelectorAll(".stat-grid")[0].querySelectorAll(".stat")[1].querySelector("b").textContent.trim(), days: document.querySelectorAll(".stat-grid")[0].querySelectorAll(".stat")[2].querySelector("b").textContent.trim(), pressed: document.querySelector("[data-range=custom]").getAttribute("aria-pressed"), toast: document.querySelector("#toast").textContent.trim(), cols: document.querySelector("#view .card .chart").querySelectorAll(".chart-col").length }; })()');
check('应用上月范围后统计数字与选中态正确', applied && applied.hash.indexOf('range=custom&from=' + lastMonthExpected.from) >= 0 && applied.hero !== '本周学习' && applied.value === '30分钟' && applied.record === '1条' && applied.days === '1天' && applied.pressed === 'true' && applied.toast.indexOf('已筛选') >= 0 && applied.cols === lastMonthExpected.days, { applied: applied, expectedDays: lastMonthExpected.days });

const appliedBars = await evaluate('(function(){ const cards = Array.from(document.querySelectorAll("#view .card")); const sub = cards.find(function(c){ return c.querySelector(".card-title h3") && c.querySelector(".card-title h3").textContent.trim() === "科目分布"; }); return { text: sub ? sub.textContent : "", trend: cards[0] ? cards[0].querySelector(".more").textContent.trim() : "" }; })()');
check('上月区间的科目分布与每日趋势跟随范围', appliedBars && appliedBars.text.indexOf('数学') >= 0 && appliedBars.text.indexOf('英语') < 0 && appliedBars.trend.indexOf('区间') >= 0, appliedBars);

await evaluate('(function(){ document.querySelector("[data-range=custom]").click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ const f = document.querySelector("#stats-range-from"); const t = document.querySelector("#stats-range-to"); f.value = "' + seed.tm10 + '"; t.value = "' + seed.lm15 + '"; f.dispatchEvent(new Event("input")); document.querySelector("#sheet [data-act=apply]").click(); return "ok"; })()');
await sleep(900);
const cross = await evaluate('(function(){ const cards = Array.from(document.querySelectorAll("#view .card")); const sub = cards.find(function(c){ return c.querySelector(".card-title h3") && c.querySelector(".card-title h3").textContent.trim() === "科目分布"; }); const recent = cards.find(function(c){ return c.querySelector(".card-title h3") && c.querySelector(".card-title h3").textContent.trim() === "最近记录"; }); return { value: document.querySelector(".hero-value").textContent.trim(), record: document.querySelectorAll(".stat-grid")[0].querySelectorAll(".stat")[1].querySelector("b").textContent.trim(), days: document.querySelectorAll(".stat-grid")[0].querySelectorAll(".stat")[2].querySelector("b").textContent.trim(), sub: sub ? sub.textContent : "", recent: recent ? recent.textContent : "", trend: cards[0] ? cards[0].querySelector(".more").textContent.trim() : "" }; })()');
const crossDays = await evaluate('(function(){ const a = new Date("' + seed.tm10 + 'T00:00:00"); const b = new Date("' + seed.lm15 + 'T00:00:00"); return Math.round((b - a) / 86400000) + 1; })()');
check('跨月自定义区间汇总正确', cross && cross.value === '1小时10分' && cross.record === '2条' && cross.days === '2天' && cross.sub.indexOf('数学') >= 0 && cross.sub.indexOf('英语') >= 0 && cross.recent.indexOf('上月记录') >= 0 && cross.recent.indexOf('两月前记录') >= 0, cross);
check('跨月区间每日趋势按天数或 31 天上限展示', cross && (crossDays <= 31 ? cross.trend.indexOf('区间 ' + crossDays + ' 天') === 0 : cross.trend.indexOf('区间最近 31 天') === 0), { trend: cross && cross.trend, crossDays: crossDays });

await evaluate('(function(){ document.querySelector("[data-range=custom]").click(); return "ok"; })()');
await sleep(500);
await evaluate('(function(){ const f = document.querySelector("#stats-range-from"); const t = document.querySelector("#stats-range-to"); f.value = "' + seed.today + '"; t.value = "' + seed.d3 + '"; document.querySelector("#sheet [data-act=apply]").click(); return "ok"; })()');
await sleep(500);
const invalid = await evaluate('(function(){ const s = document.querySelector("#sheet"); return { visible: s ? !s.hidden : false, toast: document.querySelector("#toast").textContent.trim(), value: document.querySelector(".hero-value").textContent.trim(), hash: location.hash }; })()');
check('开始晚于结束时提示且不应用', invalid && invalid.visible === true && invalid.toast === '开始日期不能晚于结束日期' && invalid.value === '1小时10分' && invalid.hash.indexOf('from=' + seed.tm10) >= 0, invalid);

await evaluate('(function(){ const f = document.querySelector("#stats-range-from"); const t = document.querySelector("#stats-range-to"); f.value = "2000-01-01"; t.value = "2000-01-31"; document.querySelector("#sheet [data-act=apply]").click(); return "ok"; })()');
await sleep(900);
const empty = await evaluate('(function(){ const cards = Array.from(document.querySelectorAll("#view .card")); return { value: document.querySelector(".hero-value").textContent.trim(), record: document.querySelectorAll(".stat-grid")[0].querySelectorAll(".stat")[1].querySelector("b").textContent.trim(), text: cards.map(function(c){ return c.textContent; }).join(" "), hash: location.hash }; })()');
check('空区间显示 0 与空状态', empty && empty.value === '0分钟' && empty.record === '0条' && empty.text.indexOf('这个时间段还没有记录') >= 0 && empty.text.indexOf('还没有学习记录') >= 0 && empty.hash.indexOf('2000-01-01') >= 0, empty);

await evaluate('location.hash = "#/stats?range=custom&from=' + seed.today + '&to=' + seed.d3 + '"; "ok"');
await sleep(900);
const invalidUrl = await evaluate('(function(){ return { hero: document.querySelector(".hero-label").textContent.trim(), custom: document.querySelector("[data-range=custom]").getAttribute("aria-pressed") }; })()');
check('非法自定义 URL 回退到本周', invalidUrl && invalidUrl.hero === '本周学习' && invalidUrl.custom === 'false', invalidUrl);

await evaluate('location.hash = "#/stats?range=custom&from=' + seed.tm10 + '&to=' + seed.lm15 + '"; "ok"');
await sleep(900);
const validUrl = await evaluate('(function(){ return { hero: document.querySelector(".hero-label").textContent.trim(), value: document.querySelector(".hero-value").textContent.trim(), custom: document.querySelector("[data-range=custom]").getAttribute("aria-pressed") }; })()');
check('合法自定义 URL 可直接打开区间', validUrl && validUrl.hero !== '本周学习' && validUrl.value === '1小时10分' && validUrl.custom === 'true', validUrl);

await evaluate('(function(){ document.querySelector("[data-range=custom]").click(); return "ok"; })()');
await sleep(500);
const yearPreset = await evaluate('(function(){ document.querySelector("#sheet [data-preset=year]").click(); return { from: document.querySelector("#stats-range-from").value, to: document.querySelector("#stats-range-to").value, on: document.querySelector("#sheet [data-preset=year]").classList.contains("on") }; })()');
const yearExpected = await evaluate('(function(){ const n = new Date(); const pad = function(x){ return String(x).padStart(2, "0"); }; const key = function(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }; return { from: n.getFullYear() + "-01-01", to: key(n) }; })()');
check('今年快捷预设从 1 月 1 日到今天', yearPreset && yearPreset.from === yearExpected.from && yearPreset.to === yearExpected.to && yearPreset.on === true, { preset: yearPreset, expected: yearExpected });
await evaluate('(function(){ document.querySelector("#sheet [data-act=cancel]").click(); return "ok"; })()');
await sleep(400);

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result39.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
try { ws.close(); } catch (_) {}
server.kill(); edge.kill();
process.exit(failed.length ? 1 : 0);
