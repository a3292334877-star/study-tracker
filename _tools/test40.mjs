/* test40：v1.38 统计分布下钻 + 记录页 URL 筛选直达
   静态：统计分布 data-drill-subject / data-drill-tag / drillHref、记录页 readInitialQuery、版本
   界面：统计页点科目 / 标签跳到记录页并带当前区间、记录页 URL 直达与非法参数忽略、搜索 / 空结果 / 清除
   用法：node _tools/test40.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8166 / 9407） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8166);
const DBG = Number(process.env.ST_DBG || 9407);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const statsSrc = read('js/views/stats.js');
const logSrc = read('js/views/log.js');
const swSrc = read('sw.js');
const meSrc = read('js/views/me.js');
const manifestXml = read('android/AndroidManifest.xml');

check('统计页科目 / 标签分布可下钻',
  statsSrc.includes('data-drill-subject') && statsSrc.includes('data-drill-tag')
    && statsSrc.includes('function drillHref(extra)') && statsSrc.includes("range: 'custom'"), true);
check('统计分布卡有下钻提示',
  statsSrc.includes('点击科目看明细') && statsSrc.includes('点击标签看明细'), true);
check('记录页支持 URL 初始筛选',
  logSrc.includes('function readInitialQuery(query)')
    && logSrc.includes('const initialQuery = readInitialQuery(ctx && ctx.query)')
    && logSrc.includes('initialQuery.subjectId') && logSrc.includes('initialQuery.tag'), true);
check('版本：sw v44 / manifest 38-1.38 / 页脚 v1.38',
  swSrc.includes("const CACHE = 'study-tracker-v44';")
    && manifestXml.includes('android:versionCode="38"')
    && manifestXml.includes('android:versionName="1.38"')
    && meSrc.includes('学习记录 v1.38'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile40-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result40.json'), JSON.stringify({ results }, null, 2));
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
  + ' const d1 = new Date(y, m, now.getDate() - 1); const d3 = new Date(y, m, now.getDate() - 3);'
  + ' const lm15 = new Date(y, m - 1, 15); const tm10 = new Date(y, m - 2, 10);'
  + ' const add = (title, minutes, dt, sid, tags) => st.addSession({ subjectId: sid, title: title, minutes: minutes, end: ts(dt), tags: tags });'
  + ' add("数学今天", 10, now, s1.id, ["函数"]);'
  + ' add("英语昨天", 20, d1, s2.id, ["单词"]);'
  + ' add("数学三天前", 30, d3, s1.id, ["函数", "错题"]);'
  + ' add("英语上月", 40, lm15, s2.id, ["单词"]);'
  + ' add("数学两月前", 50, tm10, s1.id, ["错题"]);'
  + ' return { today: st.dateKey(now), d3: st.dateKey(d3), lm15: st.dateKey(lm15), tm10: st.dateKey(tm10), math: s1.id, en: s2.id };'
  + '})()',
  true
);
check('种子数据就绪', seed && seed.today && seed.tm10 && seed.math && seed.en, seed);

await evaluate('location.hash = "#/stats?range=custom&from=' + seed.tm10 + '&to=' + seed.today + '"; "ok"');
await sleep(1100);
const statsRows = await evaluate('(function(){ const cards = Array.from(document.querySelectorAll("#view .card")); const find = function(t){ return cards.find(function(c){ return c.querySelector(".card-title h3") && c.querySelector(".card-title h3").textContent.trim() === t; }); }; const sub = find("科目分布"); const tag = find("标签分布"); return { hero: document.querySelector(".hero-label").textContent.trim(), subs: sub ? Array.from(sub.querySelectorAll("[data-drill-subject]")).map(function(el){ return el.textContent.trim(); }) : [], tags: tag ? Array.from(tag.querySelectorAll("[data-drill-tag]")).map(function(el){ return el.textContent.trim(); }) : [], subHint: sub ? sub.querySelector(".more").textContent.trim() : "", tagHint: tag ? tag.querySelector(".more").textContent.trim() : "", subCursor: sub && sub.querySelector("[data-drill-subject]") ? sub.querySelector("[data-drill-subject]").style.cursor : "" }; })()');
check('统计页按自定义区间显示可点击的科目 / 标签行', statsRows && statsRows.hero !== '本周学习' && statsRows.subs.join(',').indexOf('数学') >= 0 && statsRows.subs.join(',').indexOf('英语') >= 0 && statsRows.tags.join(',').indexOf('函数') >= 0 && statsRows.tags.join(',').indexOf('单词') >= 0, statsRows);
check('科目 / 标签分布卡有下钻提示与手型光标', statsRows && statsRows.subHint === '点击科目看明细' && statsRows.tagHint === '点击标签看明细' && statsRows.subCursor === 'pointer', statsRows);

await evaluate('(function(){ const row = Array.from(document.querySelectorAll("[data-drill-subject]")).find(function(el){ return el.textContent.indexOf("数学") >= 0; }); row.click(); return "ok"; })()');
await sleep(1000);
const subDrill = await evaluate('(function(){ const q = new URLSearchParams(location.hash.split("?")[1] || ""); const chip = Array.from(document.querySelectorAll("[data-act=subject]")).find(function(b){ return b.dataset.sid === "' + seed.math + '"; }); const allChip = Array.from(document.querySelectorAll("[data-act=subject]")).find(function(b){ return b.dataset.sid === ""; }); return { hash: location.hash, range: q.get("range"), from: q.get("from"), to: q.get("to"), subject: q.get("subject"), count: document.querySelector("#log-count").textContent.trim(), body: document.querySelector("#log-body").textContent, subjectOn: chip ? chip.classList.contains("on") : false, allOn: allChip ? allChip.classList.contains("on") : true, customOn: document.querySelector("[data-filter=custom]").getAttribute("aria-pressed") }; })()');
check('点科目下钻带当前区间与科目参数', subDrill && subDrill.range === 'custom' && subDrill.from === seed.tm10 && subDrill.to === seed.today && subDrill.subject === seed.math && subDrill.hash.indexOf('#/log?') === 0, subDrill);
check('记录页按 URL 科目筛选并选中科目 chip', subDrill && subDrill.subjectOn === true && subDrill.allOn === false && subDrill.customOn === 'true', subDrill);
check('科目下钻后的记录数与内容正确', subDrill && subDrill.count === '找到 3 条 · 合计 1h30m' && subDrill.body.indexOf('数学今天') >= 0 && subDrill.body.indexOf('数学三天前') >= 0 && subDrill.body.indexOf('数学两月前') >= 0 && subDrill.body.indexOf('英语昨天') < 0, subDrill);

await evaluate('location.hash = "#/stats?range=custom&from=' + seed.tm10 + '&to=' + seed.today + '"; "ok"');
await sleep(900);
await evaluate('(function(){ const row = Array.from(document.querySelectorAll("[data-drill-tag]")).find(function(el){ return el.textContent.indexOf("函数") >= 0; }); row.click(); return "ok"; })()');
await sleep(1000);
const tagDrill = await evaluate('(function(){ const q = new URLSearchParams(location.hash.split("?")[1] || ""); const chip = Array.from(document.querySelectorAll("[data-act=tag]")).find(function(b){ return b.dataset.tag === "函数"; }); return { range: q.get("range"), tag: q.get("tag"), subject: q.get("subject"), count: document.querySelector("#log-count").textContent.trim(), body: document.querySelector("#log-body").textContent, tagOn: chip ? chip.classList.contains("on") : false }; })()');
check('点标签下钻带当前区间与标签参数', tagDrill && tagDrill.range === 'custom' && tagDrill.tag === '函数' && tagDrill.subject === null, tagDrill);
check('记录页按 URL 标签筛选并选中标签 chip', tagDrill && tagDrill.tagOn === true, tagDrill);
check('标签下钻后的记录数与内容正确', tagDrill && tagDrill.count === '找到 2 条 · 合计 40分' && tagDrill.body.indexOf('数学今天') >= 0 && tagDrill.body.indexOf('数学三天前') >= 0 && tagDrill.body.indexOf('英语昨天') < 0, tagDrill);

await evaluate('location.hash = "#/home"; "ok"');
await sleep(400);
await evaluate('location.hash = "#/log?range=custom&from=' + seed.tm10 + '&to=' + seed.today + '&subject=' + seed.math + '"; "ok"');
await sleep(1000);
const direct = await evaluate('(function(){ const chip = Array.from(document.querySelectorAll("[data-act=subject]")).find(function(b){ return b.dataset.sid === "' + seed.math + '"; }); return { hash: location.hash, count: document.querySelector("#log-count").textContent.trim(), customOn: document.querySelector("[data-filter=custom]").getAttribute("aria-pressed"), subjectOn: chip ? chip.classList.contains("on") : false }; })()');
check('记录页可从 URL 直接打开科目筛选', direct && direct.count === '找到 3 条 · 合计 1h30m' && direct.customOn === 'true' && direct.subjectOn === true, direct);

await evaluate('location.hash = "#/log?range=month"; "ok"');
await sleep(900);
const monthUrl = await evaluate('(function(){ return { monthOn: document.querySelector("[data-filter=month]").getAttribute("aria-pressed"), allOn: document.querySelector("[data-filter=all]").getAttribute("aria-pressed"), count: document.querySelector("#log-count").textContent.trim() }; })()');
check('记录页 URL 支持 range=month', monthUrl && monthUrl.monthOn === 'true' && monthUrl.allOn === 'false' && monthUrl.count.indexOf('找到') === 0, monthUrl);

await evaluate('location.hash = "#/log?range=custom&from=' + seed.tm10 + '&to=' + seed.today + '&subject=ghost"; "ok"');
await sleep(900);
const badSubject = await evaluate('(function(){ const chips = Array.from(document.querySelectorAll("[data-act=subject]")); return { anyOn: chips.some(function(b){ return b.classList.contains("on") && b.dataset.sid !== ""; }), allOn: chips.find(function(b){ return b.dataset.sid === ""; }).classList.contains("on"), count: document.querySelector("#log-count").textContent.trim() }; })()');
check('URL 里不存在的科目会被忽略', badSubject && badSubject.anyOn === false && badSubject.allOn === true && badSubject.count === '找到 5 条 · 合计 2h30m', badSubject);

await evaluate('location.hash = "#/log?range=custom&from=' + seed.tm10 + '&to=' + seed.today + '&subject=' + seed.math + '&q=今天"; "ok"');
await sleep(900);
const qUrl = await evaluate('(function(){ return { value: document.querySelector("#log-q").value, count: document.querySelector("#log-count").textContent.trim(), body: document.querySelector("#log-body").textContent }; })()');
check('URL 搜索词与科目筛选可叠加', qUrl && qUrl.value === '今天' && qUrl.count === '找到 1 条 · 合计 10分' && qUrl.body.indexOf('数学今天') >= 0, qUrl);

await evaluate('location.hash = "#/log?range=custom&from=2000-1-1&to=bad"; "ok"');
await sleep(900);
const badRange = await evaluate('(function(){ return { allOn: document.querySelector("[data-filter=all]").getAttribute("aria-pressed"), count: document.querySelector("#log-count").textContent.trim() }; })()');
check('非法自定义范围回退到全部', badRange && badRange.allOn === 'true' && badRange.count === '共 5 条 · 合计 2h30m', badRange);

await evaluate('location.hash = "#/log?q=zzz不存在"; "ok"');
await sleep(900);
const empty = await evaluate('(function(){ return { count: document.querySelector("#log-count").textContent.trim(), body: document.querySelector("#log-body").textContent }; })()');
check('URL 搜索无结果显示空状态', empty && empty.count === '找到 0 条' && empty.body.indexOf('没有符合条件的记录') >= 0, empty);

await evaluate('(function(){ const b = document.querySelector("#log-body [data-act=log-clear]"); if (b) b.click(); return "ok"; })()');
await sleep(700);
const cleared = await evaluate('(function(){ return { value: document.querySelector("#log-q").value, count: document.querySelector("#log-count").textContent.trim(), allOn: document.querySelector("[data-filter=all]").getAttribute("aria-pressed") }; })()');
check('清除筛选恢复全部记录', cleared && cleared.value === '' && cleared.count === '共 5 条 · 合计 2h30m' && cleared.allOn === 'true', cleared);

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result40.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
try { ws.close(); } catch (_) {}
server.kill(); edge.kill();
process.exit(failed.length ? 1 : 0);
