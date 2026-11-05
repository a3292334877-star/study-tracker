/* test6：v1.4 新增校验
   1) 静态离线完整性：js/** 的静态 import 都存在 + sw.js 预缓存清单覆盖全部模块与样式分片
   2) 1000 条数据的记录页渲染耗时与首屏行数（分页不该把 1000 条全渲染）
   3) 无障碍：弹层 role/aria-modal、焦点陷阱、Esc 关闭、路由播报
   用法：node _tools/test6.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8126);
const DBG = Number(process.env.ST_DBG || 9356);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态离线完整性（不需要浏览器） ---------- */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const jsFiles = walk(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

// 1.1 所有静态 import 指向的文件都存在
const badImports = [];
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /(?:^|[^\w.])(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec.split('?')[0]);
    if (!fs.existsSync(target)) badImports.push(`${rel(file)} -> ${spec}`);
  }
}
check('静态 import 目标全部存在', badImports.length === 0, badImports);

// 1.2 index.html 引用的样式都存在
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cssRefs = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.endsWith('.css'));
const missingCss = cssRefs.filter((h) => !fs.existsSync(path.join(ROOT, h)));
check('index.html 样式引用都存在', missingCss.length === 0, { cssRefs, missingCss });

// 1.3 sw.js 预缓存清单覆盖全部 js 模块与样式分片
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const arrStart = swSrc.indexOf('const ASSETS = [');
const arrEnd = swSrc.indexOf('];', arrStart);
const assetsBlock = swSrc.slice(arrStart, arrEnd);
const listed = new Set([...assetsBlock.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1].replace(/^\.\//, '')));
const expectAssets = [...jsFiles.map(rel), ...cssRefs];
const notCached = expectAssets.filter((f) => !listed.has(f));
check('SW 预缓存覆盖全部模块', notCached.length === 0, notCached);
const staleAssets = [...listed].filter((f) => !fs.existsSync(path.join(ROOT, f)));
check('SW 清单无失效条目', staleAssets.length === 0, staleAssets);
check('SW 缓存版本号存在', /const CACHE = 'study-tracker-v\d+'/.test(swSrc), swSrc.match(/const CACHE = '[^']+'/)?.[0]);

/* ---------- 2. 启动静态服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, `_profile6-${PORT}`);
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=390,844', `--user-data-dir=${userDir}`, `--remote-debugging-port=${DBG}`, 'about:blank',
], { stdio: 'ignore' });

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
let wsUrl = null;
for (let i = 0; i < 80; i += 1) {
  try {
    const list = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`));
    const page = list.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(250);
}
if (!wsUrl) { console.error('no devtools'); server.kill(); edge.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push({ type: msg.params.type, text: (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ') });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
  }
  if (msg.method === 'Log.entryAdded') logs.push({ type: 'log:' + msg.params.entry.level, text: msg.params.entry.text });
};
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expr, awaitPromise = false) {
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise, userGesture: true });
  if (res.exceptionDetails) return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  return res.result.value;
}
async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(res.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

const URL = `http://127.0.0.1:${PORT}/index.html`;
await send('Page.navigate', { url: URL + '#/home' });
await sleep(1200);

/* ---------- 3. 1000 条数据的记录页渲染 ---------- */
const seed1000 = await evaluate(`(() => {
  const raw = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const base = Date.now();
  const subjects = (raw.subjects && raw.subjects.length) ? raw.subjects : [{ id: 's1', name: '高等数学', emoji: '📐', color: '#4f6df5', goalMinWeek: 0, archived: false, createdAt: base }];
  const sessions = [];
  for (let i = 0; i < 1000; i += 1) {
    const end = base - i * 3600000 * 3;
    const minutes = 20 + (i % 50);
    sessions.push({ id: 'x' + i, subjectId: subjects[i % subjects.length].id, start: end - minutes * 60000, end, minutes, title: '批量记录 ' + i, note: '自动生成的第 ' + i + ' 条', demo: true });
  }
  raw.subjects = subjects;
  raw.sessions = sessions;
  raw.seeded = true;
  localStorage.setItem('study-tracker/v1', JSON.stringify(raw));
  return { sessions: sessions.length, subjects: subjects.length };
})()`);
check('注入 1000 条数据', seed1000 && seed1000.sessions === 1000, seed1000);

// 写入 localStorage 后必须真正重载页面，store 才会读到 1000 条（仅改 hash 不会重载）
await send('Page.reload', { ignoreCache: true });
await sleep(1500);
await send('Page.navigate', { url: URL + '#/log' });
await sleep(1200);
const perf = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  const totalBefore = S.getState().sessions.length;
  const t0 = performance.now();
  S.addSession({ subjectId: S.getState().subjects[0].id, title: '性能探针', minutes: 10, end: Date.now() });
  const ms = performance.now() - t0;
  const countEl = document.getElementById('log-count');
  const m = (countEl ? countEl.textContent : '').match(/共\\s*(\\d+)\\s*条/);
  return {
    ms: Math.round(ms * 10) / 10,
    totalBefore,
    rows: document.querySelectorAll('#log-body [data-session]').length,
    totalText: m ? Number(m[1]) : null,
    hasMoreBtn: Boolean(document.querySelector('#log-loadmore')),
  };
})()`, true);
check('记录页 1000 条不全量渲染', perf && perf.totalBefore >= 1000 && perf.rows > 0 && perf.rows <= 120, perf);
check('记录页渲染耗时 < 1200ms', perf && perf.ms < 1200, { ms: perf && perf.ms });
check('记录页总数按全量口径', perf && perf.totalText === 1001, perf);
await shot('t6-log-1000');

/* ---------- 4. 无障碍：弹层焦点陷阱 + Esc + 路由播报 ---------- */
const srText = await evaluate("document.getElementById('sr-status')?.textContent || ''");
check('路由切换写入读屏播报', String(srText).includes('记录'), { srText });

await evaluate("document.getElementById('tab-add').click()");
await sleep(500);
const dialog = await evaluate(`(() => {
  const sheet = document.getElementById('sheet');
  return {
    hidden: sheet.hidden,
    role: sheet.getAttribute('role'),
    modal: sheet.getAttribute('aria-modal'),
    label: sheet.getAttribute('aria-label'),
    focusInside: sheet.contains(document.activeElement),
    active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
  };
})()`);
check('弹层声明为模态对话框', dialog && dialog.hidden === false && dialog.role === 'dialog' && dialog.modal === 'true', dialog);
check('弹层打开后焦点进入弹层', dialog && dialog.focusInside === true, dialog);

for (let i = 0; i < 12; i += 1) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await sleep(40);
}
const trap = await evaluate("(() => { const s = document.getElementById('sheet'); return { inside: s.contains(document.activeElement), open: !s.hidden }; })()");
check('Tab 焦点被限制在弹层内', trap && trap.inside === true, trap);

await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(600);
const afterEsc = await evaluate("(() => ({ open: !document.getElementById('sheet').hidden, inner: document.getElementById('sheet').innerHTML.length }))()");
check('Esc 关闭弹层', afterEsc && (afterEsc.open === false || afterEsc.inner === 0), afterEsc);

/* ---------- 5. 新功能端到端（标签 / 撤销 / 模板 / 多份快照 / 合并导入 / 统计卡 / 备份列表） ---------- */
const reset = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  S.resetAll();
  const a = S.addSubject({ name: '高等数学', emoji: '📐', color: '#4f6df5' });
  const b = S.addSubject({ name: '英语', emoji: '🗣️', color: '#22c55e' });
  const now = Date.now();
  S.addSession({ subjectId: a.id, title: '级数收敛判别', note: '比值判别法做了 5 题', minutes: 25, tags: ['错题', '第3章'], end: now - 3600000 });
  S.addSession({ subjectId: b.id, title: '听力精听', note: 'Section 3 没跟上', minutes: 30, tags: ['听力'], end: now - 7200000 });
  S.addSession({ subjectId: a.id, title: '中值定理', note: '罗尔 / 拉格朗日', minutes: 40, tags: ['错题'], end: now - 86400000 });
  const st = S.getState();
  return { sessions: st.sessions.length, subjects: st.subjects.length, tags: S.allTags().map((t) => t.tag) };
})()`, true);
check('数据层：标签归一与查询', reset && reset.sessions === 3 && reset.subjects === 2 && reset.tags.length === 3, reset);

await evaluate("location.hash = '#/log'");
await sleep(800);
const logBase = await evaluate(`(() => ({
  count: document.getElementById('log-count') ? document.getElementById('log-count').textContent.trim() : '',
  rows: document.querySelectorAll('#log-body [data-session]').length,
  tagChips: [...document.querySelectorAll('[data-act=tag][data-tag]')].filter((b) => b.dataset.tag).length,
}))()`);
check('记录页：标签 chips 与全量计数', logBase && logBase.rows === 3 && logBase.tagChips >= 3 && logBase.count.includes('共 3 条'), logBase);

await evaluate(`(() => { const b = [...document.querySelectorAll('[data-act=tag][data-tag]')].find((x) => x.dataset.tag === '错题'); if (b) b.click(); })()`);
await sleep(500);
const tagFiltered = await evaluate(`(() => {
  const b = [...document.querySelectorAll('[data-act=tag][data-tag]')].find((x) => x.dataset.tag === '错题');
  return {
    rows: document.querySelectorAll('#log-body [data-session]').length,
    count: document.getElementById('log-count').textContent.trim(),
    pressed: b ? b.getAttribute('aria-pressed') : null,
  };
})()`);
check('记录页：标签筛选生效', tagFiltered && tagFiltered.rows === 2 && tagFiltered.count.includes('找到 2 条') && tagFiltered.pressed === 'true', tagFiltered);

/* v1.5：编辑记录只局部刷新，筛选条件 / 已加载列表 / 滚动位置都要保留 */
await evaluate("document.querySelector('#log-body [data-session]').click()");
await sleep(600);
await evaluate(`(() => {
  const s = document.getElementById('sheet');
  s.querySelector('#r-title').value = '级数收敛判别（改）';
  s.querySelector('[data-act=save]').click();
})()`);
await sleep(800);
const afterEdit = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('#log-body [data-session]')];
  const b = [...document.querySelectorAll('[data-act=tag][data-tag]')].find((x) => x.dataset.tag === '错题');
  return {
    rows: rows.length,
    count: document.getElementById('log-count').textContent.trim(),
    pressed: b ? b.getAttribute('aria-pressed') : null,
    edited: rows.some((r) => r.textContent.includes('（改）')),
    sheetClosed: document.getElementById('sheet').hidden,
  };
})()`);
check('记录页：编辑后筛选与列表保留', afterEdit && afterEdit.rows === 2 && afterEdit.pressed === 'true' && afterEdit.count.includes('找到 2 条') && afterEdit.edited && afterEdit.sheetClosed, afterEdit);

/* v1.5：只切时间范围也算筛选，计数改为「找到 N 条」 */
await evaluate("location.hash = '#/home'");
await sleep(600);
await evaluate("location.hash = '#/log'");
await sleep(800);
await evaluate("(() => { const b = document.querySelector('[data-filter=week]'); if (b) b.click(); })()");
await sleep(500);
const rangeOnly = await evaluate(`(() => ({
  rows: document.querySelectorAll('#log-body [data-session]').length,
  count: document.getElementById('log-count').textContent.trim(),
}))()`);
check('记录页：仅时间范围筛选显示找到 N 条', rangeOnly && rangeOnly.rows === 3 && rangeOnly.count.includes('找到 3 条'), rangeOnly);
await evaluate("(() => { const b = document.querySelector('[data-filter=all]'); if (b) b.click(); })()");
await sleep(400);

await evaluate(`(() => { const b = [...document.querySelectorAll('[data-act=tag][data-tag]')].find((x) => x.dataset.tag === ''); if (b) b.click(); })()`);
await sleep(400);
await evaluate(`(() => { const i = document.getElementById('log-q'); i.value = '听力'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(800);
const searched = await evaluate(`(() => ({
  rows: document.querySelectorAll('#log-body [data-session]').length,
  count: document.getElementById('log-count').textContent.trim(),
  marks: document.querySelectorAll('#log-body mark.hl').length,
}))()`);
check('记录页：关键词搜索与高亮', searched && searched.rows === 1 && searched.marks > 0 && searched.count.includes('找到 1 条'), searched);

await evaluate(`(() => { const c = document.getElementById('log-clr'); if (c && !c.hidden) c.click(); })()`);
await sleep(500);
await evaluate(`document.querySelector('#log-body [data-session]').click()`);
await sleep(600);
const editOpen = await evaluate(`(() => { const s = document.getElementById('sheet'); return { open: !s.hidden, hasDelete: Boolean(s.querySelector('[data-act=delete]')) }; })()`);
check('记录页：点一行进入编辑弹层', editOpen && editOpen.open && editOpen.hasDelete, editOpen);
await evaluate(`document.querySelector('#sheet [data-act=delete]').click()`);
await sleep(600);
await evaluate(`(() => { const y = document.querySelector('#sheet [data-act=yes]'); if (y) y.click(); })()`);
await sleep(700);
const undo = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  return { bar: Boolean(document.querySelector('.sheetx-undo')), btn: Boolean(document.querySelector('.sheetx-undo-btn')), sessions: S.getState().sessions.length };
})()`, true);
check('删除后出现撤销条', undo && undo.bar && undo.btn && undo.sessions === 2, undo);
await evaluate(`document.querySelector('.sheetx-undo-btn').click()`);
await sleep(600);
const undoBack = await evaluate(`(async () => { const S = await import('/js/store.js'); return S.getState().sessions.length; })()`, true);
check('撤销删除恢复记录', undoBack === 3, { sessions: undoBack });

await evaluate(`location.hash = '#/home'`);
await sleep(700);
await evaluate(`document.getElementById('tab-add').click()`);
await sleep(700);
const tplSave = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  const sheet = document.getElementById('sheet');
  sheet.querySelector('#r-title').value = '听力精听练习';
  sheet.querySelector('#r-minutes').value = '30';
  const tags = sheet.querySelector('#r-tags');
  tags.value = '听力, 复习';
  tags.dispatchEvent(new Event('input', { bubbles: true }));
  sheet.querySelector('[data-act=tpl-save]').click();
  const list = S.getTemplates();
  return { templates: list.map((t) => ({ title: t.title, minutes: t.minutes, tags: t.tags })), chips: sheet.querySelectorAll('[data-tpl]').length };
})()`, true);
check('存为模板', tplSave && tplSave.templates.length === 1 && tplSave.templates[0].minutes === 30 && tplSave.templates[0].tags.length === 2 && tplSave.chips === 1, tplSave);

await evaluate(`(async () => { const u = await import('/js/util.js'); u.closeSheet(); })()`, true);
await sleep(500);
await evaluate(`document.getElementById('tab-add').click()`);
await sleep(700);
const tplApply = await evaluate(`(() => {
  const sheet = document.getElementById('sheet');
  const title = sheet.querySelector('#r-title');
  title.value = '';
  const btn = sheet.querySelector('[data-tpl]');
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true, title: title.value, minutes: sheet.querySelector('#r-minutes').value, tags: sheet.querySelector('#r-tags').value };
})()`);
check('模板一键填入', tplApply && tplApply.ok && tplApply.title === '听力精听练习' && tplApply.minutes === '30', tplApply);
await evaluate(`(async () => { const u = await import('/js/util.js'); u.closeSheet(); })()`, true);
await sleep(400);

const backups = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  const before = S.listBackups().length;
  S.saveBackupSnapshot('manual', '期末复习前');
  S.saveBackupSnapshot('manual', '换机前');
  const list = S.listBackups();
  const count = list.length;
  const names = list.map((b) => b.name).slice(0, 2);
  S.removeBackup(list[0].id);
  return { before, count, names, afterRemove: S.listBackups().length };
})()`, true);
check('多份快照：命名 / 保留 / 删除', backups && backups.count === backups.before + 2 && backups.names[0] === '换机前' && backups.names[1] === '期末复习前' && backups.afterRemove === backups.count - 1, backups);

const merge = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  const before = S.getState().sessions.length;
  const now = Date.now();
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: S.getState().settings,
    subjects: [{ id: 'imp1', name: '数据结构', emoji: '🖥️', color: '#7d5cff', goalMinWeek: 0, archived: false, createdAt: now }],
    sessions: [1, 2, 3].map((i) => ({ id: 'imp-' + i, subjectId: 'imp1', title: '导入记录 ' + i, note: '', minutes: 20, tags: ['导入'], end: now - i * 86400000, start: now - i * 86400000 - 1200000 })),
    todos: [], reviews: {}, templates: [],
  };
  const text = JSON.stringify(payload);
  const merged = S.importJSON(text, { mode: 'merge' });
  const afterMerge = { mode: merged.mode, added: merged.addedSessions, sessions: S.getState().sessions.length, subjects: S.getState().subjects.length };
  const rep = S.importJSON(text, { mode: 'replace' });
  const afterReplace = { mode: rep.mode, sessions: S.getState().sessions.length, subjects: S.getState().subjects.length };
  return { before, afterMerge, afterReplace };
})()`, true);
check('导入合并：保留原数据并追加', merge && merge.afterMerge.mode === 'merge' && merge.afterMerge.added === 3 && merge.afterMerge.sessions === merge.before + 3 && merge.afterMerge.subjects === 3, merge);
check('导入覆盖：替换全部数据', merge && merge.afterReplace.mode === 'replace' && merge.afterReplace.sessions === 3 && merge.afterReplace.subjects === 1, merge);

await evaluate(`location.hash = '#/stats?range=week'`);
await sleep(900);
const statsUi = await evaluate(`(() => {
  const v = document.getElementById('view').textContent;
  return { hasPrev: v.includes('上周') || v.includes('上月'), hasBest: v.includes('最佳单日'), hasStreak: Boolean(document.querySelector('[data-act=streak-card]')) };
})()`);
check('统计页：周期对比与最佳单日', statsUi && statsUi.hasPrev && statsUi.hasBest && statsUi.hasStreak, statsUi);
await evaluate(`document.querySelector('[data-act=streak-card]').click()`);
await sleep(900);
const streak = await evaluate(`(() => { const c = document.getElementById('streak-canvas'); if (!c) return { ok: false }; const d = c.toDataURL('image/png'); return { ok: true, w: c.width, h: c.height, len: d.length }; })()`);
check('打卡分享卡可生成', streak && streak.ok && streak.len > 5000, streak);
await evaluate(`(async () => { const u = await import('/js/util.js'); u.closeSheet(); })()`, true);
await sleep(400);

await evaluate(`location.hash = '#/stats?range=all'`);
await sleep(800);
const overflow = await evaluate(`(() => {
  const chart = document.querySelector('.chart');
  return {
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    cols: chart ? chart.children.length : 0,
    chartScroll: chart ? chart.scrollWidth : null,
    chartClient: chart ? chart.clientWidth : null,
  };
})()`);
check('统计页：全部区间无横向溢出', overflow && overflow.doc <= overflow.win + 1, overflow);

await evaluate(`location.hash = '#/stats?range=week'`);   // 周报卡只在「本周」渲染
await sleep(800);
await evaluate(`(() => { const b = document.querySelector('[data-act=report-poster]'); if (b) b.click(); })()`);
await sleep(900);
const poster = await evaluate(`(() => { const c = document.getElementById('report-canvas'); if (!c) return { ok: false }; const d = c.toDataURL('image/png'); return { ok: true, w: c.width, h: c.height, len: d.length }; })()`);
check('周报海报可生成', poster && poster.ok && poster.len > 10000, poster);
await evaluate(`(async () => { const u = await import('/js/util.js'); u.closeSheet(); })()`, true);
await sleep(400);

await evaluate(`location.hash = '#/me'`);
await sleep(800);
await evaluate(`(() => { const b = document.querySelector('[data-act=backups]'); if (b) b.click(); })()`);
await sleep(700);
const meBackups = await evaluate(`(async () => {
  const S = await import('/js/store.js');
  const s = document.getElementById('sheet');
  return { open: !s.hidden, rows: s.querySelectorAll('.mez-backup-row').length, expect: S.listBackups().length, hint: (s.textContent || '').includes('最多保留 7 份') };
})()`, true);
check('我的页：备份快照列表', meBackups && meBackups.open && meBackups.rows === meBackups.expect && meBackups.expect >= 2 && meBackups.hint, meBackups);
await evaluate(`(() => { const c = document.querySelector('#sheet [data-act=close]'); if (c) c.click(); })()`);
await sleep(500);
const meVersion = await evaluate("document.getElementById('view').textContent");
check('我的页版本号 v1.8', typeof meVersion === 'string' && meVersion.includes('v1.8'), { text: typeof meVersion === 'string' ? meVersion.slice(-80) : meVersion });

/* ---------- 6. 无报错 + 输出 ---------- */
const errors = logs.filter((l) => l.type === 'exception' || l.type === 'error' || l.type === 'log:error');
check('控制台无错误', errors.length === 0, errors);

fs.writeFileSync(path.join(OUT, 'result6.json'), JSON.stringify({ results, logs: logs.slice(0, 30) }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, failures: failed, results }, null, 2));

ws.close();
edge.kill();
server.kill();
process.exit(failed.length ? 1 : 0);
