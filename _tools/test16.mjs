/* test16：v1.16 成就徽章（#/achievements 成就墙 + 成就卡海报 + 文字复制）
   1) 静态：store.achievementStats / achievements 视图 / app 路由 / me 入口 / 版本号
   2) 数据：14 枚徽章定义、解锁数量、进度与统计口径
   3) 界面：成就页英雄数字、徽章分组与点亮态、我的页入口、成就卡 Canvas、文字总结
   用法：node _tools/test16.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8136 / 9377） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8136);
const DBG = Number(process.env.ST_DBG || 9377);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查 ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const achSrc = read('js/views/achievements.js');
const appSrc = read('js/app.js');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');
const indexHtml = read('index.html');
const reportSrc = read('js/report.js');

const BADGE_IDS = ['first','hours10','records50','hours100','streak3','streak7','streak30','days60','subjects3','tags5','morning','night','bestday4h','pomodoro10'];
check('store 成就统计与 14 枚徽章',
  storeSrc.includes('export function achievementStats')
    && BADGE_IDS.every((id) => storeSrc.includes("id: '" + id + "'"))
    && storeSrc.includes('bestday4h') && storeSrc.includes('pomodoro10'), true);
check('成就视图与海报函数',
  achSrc.includes('export function renderAchievements') && achSrc.includes('export function achievementText')
    && achSrc.includes('ach-grid') && achSrc.includes('data-act="ach-poster"')
    && reportSrc.includes('export function drawAchievementPoster'), true);
check('路由与我的页入口',
  appSrc.includes("import { renderAchievements }") && appSrc.includes('achievements: renderAchievements')
    && meSrc.includes('data-act="achievements"') && meSrc.includes('achievementStats()'), true);
check('版本：sw v21 / manifest 15-1.16 / 页脚 v1.16 / 样式',
  swSrc.includes("const CACHE = 'study-tracker-v21';")
    && manifestXml.includes('android:versionCode="15"') && manifestXml.includes('android:versionName="1.16"')
    && meSrc.includes('学习记录 v1.16')
    && swSrc.includes('./js/views/achievements.js') && swSrc.includes('./css/parts/achievements.css')
    && indexHtml.includes('css/parts/achievements.css'), true);

/* ---------- 2. 起服务器 + Edge ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile16-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result16.json'), JSON.stringify({ results }, null, 2));
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

/* ---------- 3. 种子数据：连续 10 天，每天 25 分钟 + 第 5 天额外 4 小时 ---------- */
const seed = await evaluate(`(async () => {
  const st = await import('./js/store.js');
  st.resetAll();
  const subs = [
    st.addSubject({ name: '数学', emoji: '📐', color: '#4f6df5' }),
    st.addSubject({ name: '英语', emoji: '📘', color: '#12b76a' }),
    st.addSubject({ name: '算法', emoji: '💻', color: '#f59e0b' }),
  ];
  const add = (subjectId, y, mo, d, h, mi, minutes, tags) => {
    const start = new Date(y, mo, d, h, mi).getTime();
    st.addSession({ subjectId, start, end: start + minutes * 60000, minutes, tags, title: '学习' });
  };
  for (let i = 0; i < 10; i++) {
    const hour = i === 0 ? 5 : (i === 9 ? 23 : 20);
    add(subs[i % 3].id, 2026, 2, 1 + i, hour, i === 0 ? 30 : 0, 25, ['t' + ((i % 5) + 1)]);
  }
  add(subs[1].id, 2026, 2, 5, 14, 0, 240, ['t2']);
  return { subjects: st.getState().subjects.length, sessions: st.getState().sessions.length };
})()`, true);
check('种子数据写入', seed && seed.subjects === 3 && seed.sessions === 11, seed);

/* ---------- 4. achievementStats 纯数据 ---------- */
const stats = await evaluate(`(async () => { const st = await import('./js/store.js'); return st.achievementStats(); })()`, true);
const unlockedIds = stats && Array.isArray(stats.items) ? stats.items.filter((x) => x.unlocked).map((x) => x.id).sort() : [];
const expectedIds = ['bestday4h','first','morning','night','pomodoro10','streak3','streak7','subjects3','tags5'].sort();
check('14 枚徽章与解锁数量',
  stats && stats.total === 14 && stats.items.length === 14 && stats.unlocked === 9 && stats.percent === 64, stats && { total: stats.total, unlocked: stats.unlocked, percent: stats.percent });
check('解锁徽章集合正确',
  JSON.stringify(unlockedIds) === JSON.stringify(expectedIds), { got: unlockedIds, expected: expectedIds });
const valueMap = stats && Object.fromEntries(stats.items.map((x) => [x.id, { value: x.value, pct: x.pct, unlocked: x.unlocked }]));
check('统计口径（490 分钟 / 11 条 / 10 天 / 最长 10 天 / 最佳单日 265 分）',
  valueMap && valueMap.hours10.value === 490 && valueMap.hours10.pct === 82 && valueMap.hours10.unlocked === false
    && valueMap.records50.value === 11 && valueMap.days60.value === 10 && valueMap.streak30.value === 10
    && valueMap.bestday4h.value === 265 && valueMap.pomodoro10.value === 10 && valueMap.subjects3.value === 3 && valueMap.tags5.value === 5
    && valueMap.streak3.value === 10 && valueMap.morning.value === 1 && valueMap.night.value === 1, valueMap);

/* ---------- 5. 成就墙页面 ---------- */
await evaluate('location.hash = "#/achievements"; "ok"');
await sleep(900);
const ui = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  const hero = q('#ach-unlocked');
  const h10 = q('[data-badge="hours10"]');
  return {
    hero: hero ? hero.textContent.replace(/\\s+/g, '') : '',
    grids: document.querySelectorAll('.ach-grid').length,
    labels: Array.from(document.querySelectorAll('.section-label')).map((x) => x.textContent.trim()),
    total: document.querySelectorAll('.ach').length,
    on: document.querySelectorAll('.ach.on').length,
    h10On: h10 ? h10.classList.contains('on') : null,
    h10Prog: h10 && h10.querySelector('.ach-prog') ? h10.querySelector('.ach-prog').textContent : '',
  };
})()`);
check('成就页英雄数字与分组',
  ui && ui.hero === '9/14枚' && ui.grids === 4 && ui.labels.join(',') === '入门,坚持,多元,专注', ui);
check('徽章卡点亮态与进度',
  ui && ui.total === 14 && ui.on === 9 && ui.h10On === false && /8h10m \/ 10h/.test(ui.h10Prog), ui);

/* ---------- 6. 我的页入口 ---------- */
await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const meRow = await evaluate(`(() => {
  const row = document.querySelector('[data-act="achievements"]');
  return { text: row ? row.textContent.replace(/\\s+/g, '') : '', has: !!row };
})()`);
check('我的页成就入口', meRow && meRow.has && meRow.text.includes('成就徽章') && meRow.text.includes('已点亮9/14枚') && meRow.text.includes('9/14'), meRow);
await evaluate('document.querySelector("[data-act=\\"achievements\\"]").click(); "ok"');
await sleep(700);
const backHash = await evaluate('location.hash');
check('入口跳转成就页', backHash === '#/achievements', backHash);

/* ---------- 7. 成就卡 Canvas ---------- */
await evaluate('document.querySelector("[data-act=\\"ach-poster\\"]").click(); "ok"');
await sleep(600);
const poster = await evaluate(`(() => {
  const s = document.querySelector('#sheet');
  const c = s && s.querySelector('#ach-canvas');
  const dataUrl = c ? c.toDataURL('image/png') : '';
  const title = s && s.querySelector('.sheet-title') ? s.querySelector('.sheet-title').textContent : '';
  const cancel = s && s.querySelector('[data-act="cancel"]');
  if (cancel) cancel.click();
  return { hasSheet: !!s, w: c ? c.width : 0, h: c ? c.height : 0, len: dataUrl.length, title };
})()`);
check('成就卡 Canvas 生成', poster && poster.hasSheet && poster.w > 500 && poster.h > poster.w && poster.len > 5000 && /成就卡/.test(poster.title), poster);
await sleep(400);

/* ---------- 8. 文字版总结 ---------- */
const text = await evaluate(`(async () => { const r = await import('./js/views/achievements.js'); const st = await import('./js/store.js'); return r.achievementText(st.achievementStats()); })()`, true);
if (typeof text !== 'string') console.log('TEXT RAW', JSON.stringify(text));
check('成就文字总结',
  typeof text === 'string' && text.includes('已点亮 9 / 14') && text.includes('🍅 番茄农夫') && text.includes('🏅 我的成就墙'),
  typeof text === 'string' ? text.slice(0, 220) : text);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));

/* ---------- 收尾 ---------- */
ws.close();
edge.kill();
server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result16.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);