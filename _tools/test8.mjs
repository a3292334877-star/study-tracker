/* test8：v1.7 数据安全收尾 + 统计增强 + 批量操作 / CSV
   1) 版本一致性：SW v25 / APK versionCode 19 (1.20) / me 页脚 v1.22 / sw 预载 js/csv.js / manifest shortcuts
   2) store：损坏留档 listCorrupt / clearCorrupt / estimateStorageBytes / removeSessions 一次删多条+删除前快照
   3) csv.js 单元：BOM、行数、逗号与引号转义、文件名
   4) 我的页：存储用量行、清除损坏留档行（有留档才出现，点了就清）、页脚版本
   5) 记录页：批量进入/勾选/全选/改科目/批量删除（快照落盘）/CSV 导出
   6) 统计页：科目趋势 canvas、时段分布 24 列、周目标达成 8 列
   用法：node _tools/test8.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8128 / 9362） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8128);
const DBG = Number(process.env.ST_DBG || 9362);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态一致性（不需要浏览器） ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const meSrc = read('js/views/me.js');
const manifestSrc = read('manifest.webmanifest');
const pkg = {
  sw: (swSrc.match(/const CACHE = '([^']+)'/) || [])[1] || '',
  swCsv: swSrc.includes("'./js/csv.js'"),
  versionCode: (manifestXml.match(/android:versionCode="(\d+)"/) || [])[1] || '',
  versionName: (manifestXml.match(/android:versionName="([^"]+)"/) || [])[1] || '',
  meVersion: /学习记录 v1\.22/.test(meSrc),
  shortcuts: (manifestSrc.match(/"shortcuts"/) ? JSON.parse(manifestSrc).shortcuts.length : 0),
  preBatchLabel: /删除前保护/.test(read('js/store.js')),
  saveFileBridge: /public void saveFile\(/.test(read('android/java/com/xuexijilu/MainActivity.java')),
};
check('v1.22 版本一致性', pkg.sw === 'study-tracker-v27' && pkg.versionCode === '21' && pkg.versionName === '1.22' && pkg.meVersion && pkg.swCsv, pkg);
check('PWA shortcuts 三入口', pkg.shortcuts === 3, pkg.shortcuts);
check('删除前保护 + saveFile 桥就绪', pkg.preBatchLabel && pkg.saveFileBridge, { preBatchLabel: pkg.preBatchLabel, saveFileBridge: pkg.saveFileBridge });

/* ---------- 2. csv.js 单元（直接 import，不需要浏览器） ---------- */
const csvMod = await import('file://' + path.join(ROOT, 'js', 'csv.js').replace(/\\/g, '/'));
const sample = [
  { subjectName: '高等数学', title: '极限,与连续', tags: ['期中', '题集'], minutes: 45, start: new Date(2026, 0, 3, 9, 5).getTime(), end: new Date(2026, 0, 3, 9, 50).getTime(), note: '含"夹逼"定理' },
  { subjectName: '英语', title: '阅读', tags: [], minutes: 0, start: new Date(2026, 0, 4, 20, 0).getTime(), end: new Date(2026, 0, 4, 20, 0).getTime(), note: '' },
];
const csv = csvMod.sessionsToCSV(sample);
const csvRows = csv.split('\r\n').filter((r) => r !== '');
const escOk = csv.includes('"极限,""与连续""') === false && csv.includes('"极限,与连续"')
  && csv.includes('含""夹逼""定理');
check('CSV BOM + 表头 + 行数', csv.charCodeAt(0) === 0xfeff && csvRows.length === 3 && csvRows[0].startsWith('\ufeff科目,标题,标签,分钟,日期'), { rows: csvRows.length, head: csvRows[0] });
check('CSV 逗号/引号转义', escOk, csvRows[1]);
check('CSV 行字段（日期/时间）', csvRows[1].includes('2026-01-03') && csvRows[1].includes('09:05') && csvRows[1].includes('09:50') && csvRows[2].includes(',0,2026-01-04'), csvRows[2]);
check('CSV 文件名格式', /^study-records-\d{8}\.csv$/.test(csvMod.csvFilename()), csvMod.csvFilename());

/* ---------- 3. 启动静态服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile8-' + PORT);
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=390,844', '--user-data-dir=' + userDir, '--remote-debugging-port=' + DBG, 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const l = JSON.parse(await new Promise((res, rej) => { http.get(`http://127.0.0.1:${DBG}/json/list`, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej); }));
    const p = l.find((t) => t.type === 'page');
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(250);
}
if (!wsUrl) {
  check('Edge 启动', false, 'debug port never opened');
  fs.writeFileSync(path.join(OUT, 'result8.json'), JSON.stringify({ results }, null, 2));
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
const URL = `http://127.0.0.1:${PORT}/index.html`;

await send('Page.navigate', { url: URL + '#/me' });
await sleep(1200);
// 种子演示数据（与首次启动一致的入口），并回到我的页
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);
await evaluate("location.hash='#/me'"); await sleep(900);

/* ---------- 4. 我的页：存储用量 / 损坏留档 / 页脚 ---------- */
const meRows = await evaluate(`(() => ({
  usageText: (document.querySelector('#storage-usage-row .row-sub')||{}).textContent || '',
  usageVal: (document.querySelector('#storage-usage-val')||{}).textContent || '',
  footer: (document.querySelector('.me-footer')||document.body).textContent.includes('学习记录 v1.22'),
}))()`);
check('存储用量行就绪', meRows.usageText.includes('本项目数据占用') && meRows.usageVal.length > 0, meRows);
check('页脚 v1.22', meRows.footer === true, meRows.footer);

// 塞一份假损坏留档 → 清除损坏留档行应出现 → 点击后清掉
const corruptProbe = await evaluate(`(async () => {
  const m = await import('./js/store.js');
  localStorage.setItem('study-tracker/corrupt/999', JSON.stringify({ raw: 'x' }));
  location.hash = '#/me';
  await new Promise(r => setTimeout(r, 100));
  location.reload();
  return true;
})()`, true);
await sleep(1800);
const rowBefore = await evaluate("(() => ({ found: !!document.querySelector('[data-act=clear-corrupt]'), val: (document.querySelector('[data-act=clear-corrupt] .row-val')||{}).textContent }))()");
check('损坏留档行出现（1 份）', corruptProbe && rowBefore.found && rowBefore.val.includes('1'), rowBefore);
await evaluate("document.querySelector('[data-act=clear-corrupt]').click()"); await sleep(500);
await evaluate("[...document.querySelectorAll('#sheet [data-act]')].find(b => b.textContent === '清除').click()"); await sleep(800);
const corruptAfter = await evaluate("(() => ({ listed: (async () => 0)(), sheetHidden: document.querySelector('#sheet').hidden }))()");
const rowAfter = await evaluate("!!document.querySelector('[data-act=clear-corrupt]')");
const listedAfter = await evaluate("Object.keys(localStorage).filter(k => k.startsWith('study-tracker/corrupt/')).length");
check('清除损坏留档生效', rowAfter === false && listedAfter === 0 && corruptAfter.sheetHidden, { rowAfter, listedAfter });

/* ---------- 5. 记录页：批量操作 ---------- */
await evaluate("location.hash='#/log'"); await sleep(1100);
const logBase = await evaluate("(() => ({ total: JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length, countText: (document.querySelector('#log-count')||{}).textContent, toolsHidden: document.querySelector('#log-tools')?.hidden }))()");
check('记录页工具行（批量/CSV）', logBase.total > 0 && logBase.toolsHidden === false, logBase);

// 进入批量模式 + 勾选两条
const batch1 = await evaluate("(() => { document.querySelector('#log-batch').click(); const rows = [...document.querySelectorAll('#log-body [data-session]')]; rows[0].click(); rows[1].click(); return { selecting: document.querySelector('#log-body').classList.contains('selecting'), barHidden: document.querySelector('#batch-bar').hidden, count: (document.querySelector('#batch-count')||{}).textContent, delDisabled: document.querySelector('#batch-del').disabled, checks: document.querySelectorAll('#log-body .rec-check').length }; })()");
check('批量模式进入 + 勾选 2 条', batch1.selecting && !batch1.barHidden && batch1.count === '已选 2 条' && batch1.delDisabled === false && batch1.checks > 0, batch1);

// 批量改科目：把选中的 2 条移到最后一个科目上
const batchSubject = await evaluate(`(async () => {
  const st = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const target = st.subjects[st.subjects.length - 1];
  const picked = [...document.querySelectorAll('#log-body .rec.picked')].map(r => r.dataset.session);
  document.querySelector('#batch-subject').click();
  await new Promise(r => setTimeout(r, 500));
  const sheetOpen = !document.querySelector('#sheet').hidden;
  const btn = document.querySelector('#sheet [data-sid]');
  const sid = btn ? btn.getAttribute('data-sid') : '';
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 700));
  const after = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const moved = picked.filter(id => { const s = after.sessions.find(x => x.id === id); return s && s.subjectId === sid; }).length;
  return { sheetOpen, moved, picked: picked.length, targetName: target.name, sheetHidden: document.querySelector('#sheet').hidden };
})()`, true);
check('批量改科目生效', batchSubject.sheetOpen && batchSubject.moved === batchSubject.picked && batchSubject.sheetHidden, batchSubject);

// 批量删除：重新进批量模式，选 2 条删除 → 快照 pre-batch 出现
const batchDel = await evaluate(`(async () => {
  document.querySelector('#log-batch').click();
  await new Promise(r => setTimeout(r, 200));
  const rows = [...document.querySelectorAll('#log-body [data-session]')];
  rows[0].click(); rows[1].click();
  const before = JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length;
  document.querySelector('#batch-del').click();
  await new Promise(r => setTimeout(r, 500));
  const confirmShown = !document.querySelector('#sheet').hidden;
  const okBtn = [...document.querySelectorAll('#sheet [data-act]')].find(b => b.textContent === '删除');
  if (okBtn) okBtn.click();
  await new Promise(r => setTimeout(r, 800));
  const after = JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length;
  const backups = JSON.parse(localStorage.getItem('study-tracker/backups/v1') || '[]');
  return { confirmShown, before, after, removed: before - after, topReason: backups[0] && backups[0].reason, barHidden: document.querySelector('#batch-bar').hidden };
})()`, true);
check('批量删除 + 删除前保护快照', batchDel.confirmShown && batchDel.removed === 2 && batchDel.topReason === 'pre-batch' && batchDel.barHidden, batchDel);

// 全选 → 计数 = 全部
const batchAll = await evaluate("(() => { document.querySelector('#log-batch').click(); document.querySelector('#batch-all').click(); return { count: (document.querySelector('#batch-count')||{}).textContent }; })()");
check('全选计数正确', batchAll.count === '已选 ' + batchDel.after + ' 条', batchAll);
await evaluate("document.querySelector('#batch-done').click()");

/* ---------- 6. CSV 导出（浏览器下载路径，stub createObjectURL） ---------- */
const csvClick = await evaluate(`(() => {
  let blobOk = false, anchorName = '';
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = () => { blobOk = true; return 'blob:fake'; };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { anchorName = this.download || ''; };
  document.querySelector('#log-csv').click();
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  return { blobOk, anchorName };
})()`);
check('CSV 导出触发下载', csvClick.blobOk && /^study-records-\d{8}\.csv$/.test(csvClick.anchorName), csvClick);

/* ---------- 7. 统计页三卡 ---------- */
await evaluate("location.hash='#/stats'"); await sleep(1100);
const stats = await evaluate("(() => ({ trend: !!document.querySelector('#trend-canvas'), trendW: (document.querySelector('#trend-canvas')||{}).width > 0, legend: document.querySelectorAll('.trend-legend-item').length, hours: document.querySelectorAll('.chart-hours .chart-col').length, goal: document.querySelectorAll('.chart-goalhist .chart-col').length }))()");
check('统计三卡（趋势/时段/周目标）', stats.trend && stats.trendW && stats.legend > 0 && stats.hours === 24 && stats.goal === 8, stats);

/* ---------- 8. manifest shortcuts / sw ---------- */
const mfetch = await evaluate(`(async () => {
  const m = await (await fetch('/manifest.webmanifest')).json();
  const sw = await (await fetch('/sw.js')).text();
  return { shortcuts: m.shortcuts.map(s => s.name), swV14: sw.includes("study-tracker-v27"), swCsv: sw.includes('./js/csv.js') };
})()`, true);
check('manifest shortcuts 内容', Array.isArray(mfetch.shortcuts) && mfetch.shortcuts.length === 3, mfetch.shortcuts);
check('sw v27 + 预载 csv.js', mfetch.swV14 && mfetch.swCsv, mfetch);

check('无异常', logs.length === 0, logs.slice(0, 3));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result8.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log(`[test8] ${results.length - failed.length}/${results.length} 通过`);
ws.close(); edge.kill(); server.kill();
process.exit(failed.length ? 1 : 0);
