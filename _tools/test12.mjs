/* test12：v1.12 CSV 导入（解析 / 预览 / 去重 / 自动建科目）+ 导出科目列修复
   1) csv.js：parseCSV / csvToRecords
   2) store.js：importSessions（pre-import 快照、去重、自动建科目）
   3) me.js：数据卡「导入 CSV」入口 + 预览弹层
   4) log.js：导出时补科目名（v1.7 遗留：科目列空白）
   5) 版本：sw v25 / manifest 19(1.20) / me 页脚 v1.20
   用法：node _tools/test12.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8132 / 9372） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8132);
const DBG = Number(process.env.ST_DBG || 9372);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const csvSrc = read('js/csv.js');
const storeSrc = read('js/store.js');
const meSrc = read('js/views/me.js');
const logSrc = read('js/views/log.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('csv.js 导入解析函数', csvSrc.includes('export function parseCSV')
  && csvSrc.includes('export function csvToRecords') && csvSrc.includes('0xfeff'), true);
check('store.js importSessions', storeSrc.includes('export function importSessions')
  && /export function importSessions[\s\S]{0,400}pre-import/.test(storeSrc), true);
check('me.js 导入 CSV 入口与预览', meSrc.includes('data-act="import-csv"')
  && meSrc.includes('function doImportCSV') && meSrc.includes('function openCsvImportSheet')
  && meSrc.includes('学习记录 v1.20'), true);
check('log.js 导出补科目名', /subjectName:\s*nameById\.get/.test(logSrc)
  && logSrc.includes('getState().subjects'), true);
check('版本：sw v25 / manifest 19-1.20', swSrc.includes("const CACHE = 'study-tracker-v25';")
  && manifestXml.includes('android:versionCode="19"') && manifestXml.includes('android:versionName="1.20"'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile12-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result12.json'), JSON.stringify({ results }, null, 2));
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

/* ---------- 3. 纯函数：parseCSV ---------- */
const T1 = '\ufeff科目,标题\r\n"数学","含,逗号"\r\n"英语","说""引号"""\r\n';
const T2 = '科目,标题,备注\r\n数学,多行,"第一行\n第二行"\r\n';
await evaluate('window.__t1 = ' + JSON.stringify(T1) + '; window.__t2 = ' + JSON.stringify(T2) + '; "ok"');
const parse = await evaluate("(async () => { const csv = await import('./js/csv.js'); const r1 = csv.parseCSV(window.__t1); const r2 = csv.parseCSV(window.__t2); return { len: r1.length, cols: r1[0].length, cell: r1[1][1], quote: r1[2][1], multi: r2[1][2] }; })()", true);
check('parseCSV 引号/逗号/BOM/CRLF', parse && parse.len === 3 && parse.cols === 2
  && parse.cell === '含,逗号' && parse.quote === '说"引号"', parse);
check('parseCSV 字段内换行', parse && typeof parse.multi === 'string' && parse.multi.indexOf('\n') > 0, parse && parse.multi);

/* ---------- 4. 纯函数：csvToRecords ---------- */
const T3 = '科目,标题,标签,分钟,日期,开始时间,结束时间,备注\r\n数学,三角公式,公式 记忆,45,2026-01-05,09:00,09:45,复习\r\n数学,,x,10,2026-01-05,10:00,10:10,\r\n英语,坏日期,x,10,不是日期,10:00,10:10,\r\n英语,没日期,x,10,,,\r\n';
const T4 = '标题,科目,分钟,日期\r\n阅读,语文,30,2026-02-01\r\n';
await evaluate('window.__t3 = ' + JSON.stringify(T3) + '; window.__t4 = ' + JSON.stringify(T4) + '; "ok"');
const recs = await evaluate("(async () => { const csv = await import('./js/csv.js'); const out = csv.csvToRecords(window.__t3); const ro = csv.csvToRecords(window.__t4); return { n: out.records.length, first: out.records[0], reasons: out.skipped.map(s => s.reason), reN: ro.records.length, reSubj: ro.records[0] && ro.records[0].subjectName, reHour: ro.records[0] ? new Date(ro.records[0].start).getHours() : -1 }; })()", true);
check('csvToRecords 解析 + 跳过原因', recs && recs.n === 1
  && recs.first && recs.first.minutes === 45 && recs.first.note === '复习'
  && Array.isArray(recs.first.tags) && recs.first.tags.join('/') === '公式/记忆'
  && recs.reasons.indexOf('标题为空') >= 0 && recs.reasons.indexOf('日期看不懂') >= 0
  && recs.reasons.indexOf('日期为空') >= 0, recs);
check('csvToRecords 表头顺序可变', recs && recs.reN === 1 && recs.reSubj === '语文' && recs.reHour === 0, recs);

/* ---------- 5. 往返：导出 → 导入 ---------- */
const rt = await evaluate("(async () => { const csv = await import('./js/csv.js'); const st = await import('./js/store.js'); const s = st.getState(); const nameById = new Map(s.subjects.map(x => [x.id, x.name])); const rows = s.sessions.slice(0, 3).map(x => Object.assign({}, x, { subjectName: nameById.get(x.subjectId) || '' })); const text = csv.sessionsToCSV(rows); const back = csv.csvToRecords(text); return { n: back.records.length, subj0: back.records[0] && back.records[0].subjectName, skipped: back.skipped.length }; })()", true);
check('导出→导入往返', rt && rt.n === 3 && !!rt.subj0 && rt.skipped === 0, rt);

/* ---------- 6. 我的页入口 + 选择文件 + 预览 + 导入 ---------- */
await evaluate("location.hash='#/me'"); await sleep(900);
const entry = await evaluate('(() => { const r = document.querySelector(\'[data-act="import-csv"]\'); return { exists: !!r, sub: r ? r.querySelector(".row-sub").textContent : "" }; })()');
check('我的页导入 CSV 入口', entry && entry.exists && /表格|科目/.test(entry.sub), entry);

const before = await evaluate("(async () => { const st = await import('./js/store.js'); return st.getState().sessions.length; })()", true);
const CSV_TEXT = '科目,标题,标签,分钟,日期,开始时间,结束时间,备注\r\n数学,t12导入A,导入 测试,25,2026-01-06,08:00,08:25,备注A\r\n新课目XYZ,t12导入B,,15,2026-01-06,09:00,09:15,\r\n';
const captured = await evaluate('(() => { window.__csvInput = null; const orig = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type === "file") { window.__csvInput = this; return; } return orig.call(this); }; document.querySelector(\'[data-act="import-csv"]\').click(); return !!window.__csvInput; })()');
check('点击后创建文件输入', captured === true, captured);

await evaluate('window.__csvText = ' + JSON.stringify(CSV_TEXT) + '; "ok"');
await evaluate('(() => { const inp = window.__csvInput; const dt = new DataTransfer(); dt.items.add(new File([window.__csvText], "t12.csv", { type: "text/csv" })); inp.files = dt.files; inp.dispatchEvent(new Event("change")); return true; })()');
await sleep(900);
const preview = await evaluate('(() => { const s = document.querySelector(\'#sheet\'); return { open: !!s && !s.hidden, text: s ? s.textContent.replace(/\\s+/g, " ") : "", yes: !!s.querySelector(\'[data-act="yes"]\') }; })()');
check('导入预览弹层', preview && preview.open && preview.yes
  && preview.text.indexOf('可导入 2 条') >= 0 && preview.text.indexOf('2 个科目') >= 0, preview && preview.text.slice(0, 120));

await evaluate('document.querySelector(\'#sheet [data-act="yes"]\').click(); "ok"');
await sleep(900);
const after1 = await evaluate("(async () => { const st = await import('./js/store.js'); const s = st.getState(); return { n: s.sessions.length, hasSubj: s.subjects.some(x => x.name === '新课目XYZ'), backup: (st.listBackups()[0] || {}).reason || '' }; })()", true);
check('导入生效（+2 条、自动建科目、pre-import 快照）', after1 && after1.n === before + 2 && after1.hasSubj && after1.backup === 'pre-import', after1);

/* ---------- 7. 重复导入全部跳过 ---------- */
const dup = await evaluate("(async () => { const st = await import('./js/store.js'); const csv = await import('./js/csv.js'); return st.importSessions(csv.csvToRecords(window.__csvText).records); })()", true);
check('重复导入按科目+标题+开始时间+时长跳过', dup && dup.added === 0 && dup.duplicates === 2, dup);

check('无异常', logs.length === 0, logs.slice(0, 3));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result12.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('[test12] ' + (results.length - failed.length) + '/' + results.length + ' 通过');
ws.close(); edge.kill(); server.kill();
process.exit(failed.length ? 1 : 0);