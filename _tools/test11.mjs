/* test11：v1.10 标签管理（重命名 / 合并 / 删除）+ 统计页标签分布
   1) store.js：tagStats / renameTag / removeTag
   2) me.js：工具卡「标签管理」入口 + 弹层（重命名 / 删除）
   3) stats.js：标签分布卡片
   4) 版本：sw v28 / manifest 22(1.23) / me 页脚 v1.24
   5) 浏览器：store 单元（改名 / 合并 / 删除）→ 我的页入口与弹层 → 删除流程 → 统计页标签分布卡
   用法：node _tools/test11.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8131 / 9368） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8131);
const DBG = Number(process.env.ST_DBG || 9368);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const meSrc = read('js/views/me.js');
const statsSrc = read('js/views/stats.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store.js 标签函数', storeSrc.includes('export function tagStats')
  && storeSrc.includes('export function renameTag') && storeSrc.includes('export function removeTag')
  && /export function tagStats[\s\S]{0,1600}TAGS_MAX/.test(storeSrc), true);
check('me.js 标签管理入口与弹层', meSrc.includes('data-act="tag-manage"')
  && meSrc.includes('function openTagSheet') && meSrc.includes('function openTagActions')
  && meSrc.includes('renameTag(tag, to)') && meSrc.includes('removeTag(tag)')
  && meSrc.includes('学习记录 v1.30'), true);
check('stats.js 标签分布卡', statsSrc.includes('标签分布') && statsSrc.includes('tagRows') && statsSrc.includes('tagMax'), true);
check('版本：sw v28 / manifest 22-1.23', swSrc.includes("const CACHE = 'study-tracker-v35';")
  && manifestXml.includes('android:versionCode="29"') && manifestXml.includes('android:versionName="1.30"'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile11-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result11.json'), JSON.stringify({ results }, null, 2));
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

/* ---------- 3. store 单元：改名 / 合并 / 删除（用唯一标签，避免撞示例数据） ---------- */
const unit = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const s = st.getState();
  const sid = s.subjects[0] ? s.subjects[0].id : null;
  st.addSession({ subjectId: sid, minutes: 10, title: 't11a', start: Date.now() - 60000, end: Date.now(), tags: ['t11tagA', 't11tagB'] });
  st.addSession({ subjectId: sid, minutes: 20, title: 't11b', start: Date.now() - 60000, end: Date.now(), tags: ['t11tagA', 't11tagC'] });
  st.addSession({ subjectId: sid, minutes: 30, title: 't11c', start: Date.now() - 60000, end: Date.now(), tags: ['t11tagC'] });
  const before = st.tagStats().find(r => r.tag === 't11tagA');
  const r1 = st.renameTag('t11tagB', 't11tagB2');
  const afterRename = st.tagStats();
  const r2 = st.renameTag('t11tagC', 't11tagA');
  const afterMerge = st.tagStats().find(r => r.tag === 't11tagA');
  const r3 = st.removeTag('t11tagB2');
  const afterRemove = st.tagStats().map(r => r.tag);
  return {
    beforeCount: before ? before.count : -1,
    r1, hasB2: afterRename.some(r => r.tag === 't11tagB2'), hasB: afterRename.some(r => r.tag === 't11tagB'),
    r2, mergedCount: afterMerge ? afterMerge.count : -1,
    r3, stillB2: afterRemove.includes('t11tagB2'),
    backupReason: (st.listBackups()[0] || {}).reason || ''
  };
})()`, true);
check('store 重命名标签', unit && unit.r1 === 1 && unit.hasB2 === true && unit.hasB === false, unit);
check('store 合并到已有标签', unit && unit.r2 >= 1 && unit.mergedCount === unit.beforeCount + 1, { r2: unit && unit.r2, mergedCount: unit && unit.mergedCount, beforeCount: unit && unit.beforeCount });
check('store 删除标签', unit && unit.r3 === 1 && unit.stillB2 === false, { r3: unit && unit.r3, stillB2: unit && unit.stillB2 });
check('标签操作先存保护快照', unit && unit.backupReason === 'pre-tag', unit && unit.backupReason);

/* ---------- 4. 我的页：标签管理入口 + 弹层 ---------- */
await evaluate("location.hash='#/me'"); await sleep(900);
const entry = await evaluate(`(() => {
  const row = document.querySelector('[data-act="tag-manage"]');
  return { exists: !!row, sub: row ? row.querySelector('.row-sub').textContent : '' };
})()`);
check('我的页标签管理入口', entry && entry.exists && /个标签/.test(entry.sub), entry);

await evaluate("document.querySelector('[data-act=\"tag-manage\"]').click(); 'ok'");
await sleep(500);
const sheet1 = await evaluate(`(() => {
  const sheet = document.querySelector('#sheet');
  return { open: sheet && !sheet.hidden, tags: sheet ? sheet.querySelectorAll('[data-tag]').length : 0, text: sheet ? sheet.textContent.slice(0, 60) : '' };
})()`);
check('标签管理弹层列出标签', sheet1 && sheet1.open && sheet1.tags > 0 && sheet1.text.includes('标签管理'), sheet1);

await evaluate("document.querySelector('#sheet [data-tag]').click(); 'ok'");
await sleep(400);
const actions = await evaluate(`(() => {
  const sheet = document.querySelector('#sheet');
  return { rename: !!sheet.querySelector('[data-do="rename"]'), del: !!sheet.querySelector('[data-do="del"]') };
})()`);
check('标签操作弹层（重命名 / 删除）', actions && actions.rename && actions.del, actions);

const delTag = await evaluate("document.querySelector('#sheet [data-tag]') ? null : (document.querySelector('#sheet h2')||{}).textContent");
// 记录要删的标签名（当前操作弹层标题 #tag）
const curTag = await evaluate("(() => { const h = document.querySelector('#sheet h2'); return h ? h.textContent.replace(/^#/, '') : ''; })()");
await evaluate("document.querySelector('#sheet [data-do=\"del\"]').click(); 'ok'");
await sleep(400);
const confirmOpen = await evaluate("!!document.querySelector('#sheet [data-act=\"yes\"]')");
await evaluate("document.querySelector('#sheet [data-act=\"yes\"]').click(); 'ok'");
await sleep(700);
const afterDel = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  let gone = false;
  try { gone = !st.tagStats().some(r => r.tag === '${String(curTag).replace(/'/g, "\'")}'); } catch (_) {}
  return { gone, sheetHidden: (() => { const s = document.querySelector('#sheet'); return !s || s.hidden; })() };
})()`, true);
check('删除标签流程移除标签', confirmOpen === true && afterDel && afterDel.gone === true, { curTag, confirmOpen, afterDel });

/* ---------- 5. 统计页：标签分布卡 ---------- */
await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const s = st.getState();
  const sid = s.subjects[0] ? s.subjects[0].id : null;
  st.addSession({ subjectId: sid, minutes: 25, title: 't11stat', start: Date.now() - 60000, end: Date.now(), tags: ['t11stat'] });
  return true;
})()`, true);
await evaluate("location.hash='#/stats'"); await sleep(1200);
const tagCard = await evaluate(`(() => {
  const cards = Array.from(document.querySelectorAll('.card'));
  const card = cards.find(c => (c.querySelector('h3')||{}).textContent === '标签分布');
  return { found: !!card, bars: card ? card.querySelectorAll('.bar-line').length : 0 };
})()`);
check('统计页标签分布卡', tagCard && tagCard.found && tagCard.bars > 0, tagCard);

check('无异常', logs.length === 0, logs.slice(0, 3));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result11.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('[test11] ' + (results.length - failed.length) + '/' + results.length + ' 通过');
ws.close(); edge.kill(); server.kill();
process.exit(failed.length ? 1 : 0);