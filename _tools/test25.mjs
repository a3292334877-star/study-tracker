/* test25：v1.24 目标补齐计划（科目目标缺口 → 每日任务）
   静态：goalPlanTasks / applyGoalPlan / 目标页新结构 / 样式 / 版本
   数据：剩余分钟均摊、任务总额、跳过已达成/未设目标科目
   界面：目标补齐卡、预览弹层、加入计划、重复加入跳过、计划页展示
   用法：node _tools/test25.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8145 / 9386） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8145);
const DBG = Number(process.env.ST_DBG || 9386);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const storeSrc = read('js/store.js');
const goalsSrc = read('js/views/goals.js');
const goalsCss = read('css/parts/goals.css');
const meSrc = read('js/views/me.js');
const swSrc = read('sw.js');
const manifestXml = read('android/AndroidManifest.xml');

check('store 目标计划 API',
  storeSrc.includes('export function goalPlanTasks')
    && storeSrc.includes('export function applyGoalPlan')
    && storeSrc.includes('const daysLeft = 7 - elapsed + 1;')
    && storeSrc.includes('todoDate(t) + \'|\' + String(t.text || \'\').trim()'), true);
check('目标页 v1.24 结构与样式',
  goalsSrc.includes('data-goal-plan-card')
    && goalsSrc.includes('data-act="goal-plan"')
    && goalsSrc.includes('openGoalPlanSheet')
    && goalsSrc.includes('applyGoalPlan')
    && goalsCss.includes('.goal-plan-day'), true);
check('版本：sw v29 / manifest 23-1.24 / 页脚 v1.24',
  swSrc.includes("const CACHE = 'study-tracker-v41';")
    && manifestXml.includes('android:versionCode="35"') && manifestXml.includes('android:versionName="1.35"')
    && meSrc.includes('学习记录 v1.35'), true);

const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);
const userDir = path.join(OUT, '_profile25-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result25.json'), JSON.stringify({ results }, null, 2));
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

const seed = await evaluate("(async () => { const st = await import('./js/store.js'); st.resetAll(); const now = Date.now(); const math = st.addSubject({ name: '数学', emoji: '📐', color: '#ef4444', goalMinWeek: 300 }); const eng = st.addSubject({ name: '英语', emoji: '📘', color: '#4f6df5', goalMinWeek: 120 }); const phys = st.addSubject({ name: '物理', emoji: '🧪', color: '#22c55e', goalMinWeek: 60 }); const chem = st.addSubject({ name: '化学', emoji: '⚗️', color: '#f59e0b' }); const add = (sub, days, min, title) => st.addSession({ subjectId: sub.id, end: now - days * 86400000, minutes: min, title }); add(math, 0, 60, '今天数学'); add(math, 1, 90, '昨天数学'); add(eng, 0, 30, '今天英语'); add(phys, 0, 60, '今天物理'); add(chem, 0, 30, '今天化学'); return { math: math.id, eng: eng.id, phys: phys.id, chem: chem.id, weekStart: st.getState().settings.weekStart }; })()", true);
check('种子：数学 5h/已学150，英语 2h/已学30，物理已达成，化学未设目标', seed && seed.math && seed.eng && seed.phys && seed.chem, seed);

const data = await evaluate("(async () => { const st = await import('./js/store.js'); const plan = st.goalPlanTasks(); const bySub = {}; plan.tasks.forEach((t) => { bySub[t.subjectId] = (bySub[t.subjectId] || 0) + t.minutes; }); return { daysLeft: plan.daysLeft, dates: plan.dates, subjects: plan.subjects, tasks: plan.tasks, total: plan.total, bySub: bySub }; })()", true);
check('计划只包含有缺口科目（数学/英语）', data && data.subjects && data.subjects.length === 2 && data.subjects.some((s) => s.id === (seed && seed.math)) && data.subjects.some((s) => s.id === (seed && seed.eng)), data && data.subjects);
const mathLeft = data && data.subjects ? data.subjects.find((s) => s.id === seed.math) : null;
const engLeft = data && data.subjects ? data.subjects.find((s) => s.id === seed.eng) : null;
check('剩余目标：数学 150 分钟，英语 90 分钟', mathLeft && mathLeft.remaining === 150 && engLeft && engLeft.remaining === 90, { mathLeft: mathLeft, engLeft: engLeft });
check('计划总分钟 = 各科缺口合计', data && data.total === 240 && data.bySub[seed.math] === 150 && data.bySub[seed.eng] === 90, data && { total: data.total, bySub: data.bySub });
check('任务日期都在今天到周日，且每天都有任务', data && data.dates && data.dates.length === data.daysLeft && data.tasks.length >= data.daysLeft * 2 && new Set(data.tasks.map((t) => t.date)).size === data.daysLeft, data && { daysLeft: data.daysLeft, dates: data.dates, first: data.tasks[0] });
check('任务分钟均为正、文本含科目与分钟', data && data.tasks.every((t) => t.minutes > 0 && t.text.indexOf(t.subjectName) >= 0 && t.text.indexOf('分钟') >= 0), data && data.tasks.slice(0, 3));

await evaluate('location.hash = "#/goals"; "ok"');
await sleep(1100);
const page = await evaluate("(() => { const card = document.querySelector('[data-goal-plan-card]'); const rows = document.querySelectorAll('.goal-plan-row'); const btn = document.querySelector('[data-act=\"goal-plan\"]'); return { route: location.hash, hasCard: !!card, rows: rows.length, text: card ? card.textContent.replace(/\s+/g, ' ').trim() : '', hasBtn: !!btn }; })()");
check('目标页显示目标补齐计划卡与两个科目缺口', page && page.route === '#/goals' && page.hasCard && page.rows === 2 && page.hasBtn && page.text.indexOf('还差') >= 0, page);

await evaluate("document.querySelector('[data-act=\"goal-plan\"]').click(); 'ok'");
await sleep(650);
const sheet = await evaluate("(() => { const days = document.querySelectorAll('.goal-plan-day'); const tasks = document.querySelectorAll('.goal-plan-task'); const title = document.querySelector('.sheet-title'); const ok = document.querySelector('[data-act=\"goal-plan-ok\"]'); return { days: days.length, tasks: tasks.length, title: title ? title.textContent.trim() : '', hasOk: !!ok }; })()");
check('预览弹层按天列出任务', sheet && sheet.title === '生成目标计划' && sheet.days === data.daysLeft && sheet.tasks === data.tasks.length && sheet.hasOk, sheet);

await evaluate("document.querySelector('[data-act=\"goal-plan-ok\"]').click(); 'ok'");
await sleep(1300);
const applied = await evaluate("(async () => { const st = await import('./js/store.js'); const raw = JSON.parse(localStorage.getItem('study-tracker/v1')); const goalTodo = raw.todos.filter((t) => t.text.indexOf('分钟') >= 0 && (t.text.indexOf('数学') >= 0 || t.text.indexOf('英语') >= 0)); const plan = st.goalPlanTasks(); const again = st.applyGoalPlan(); const after = JSON.parse(localStorage.getItem('study-tracker/v1')).todos.filter((t) => t.text.indexOf('分钟') >= 0 && (t.text.indexOf('数学') >= 0 || t.text.indexOf('英语') >= 0)); return { count: goalTodo.length, tasks: plan.tasks.length, added: again.added, skipped: again.skipped, total: again.total, countAfter: after.length, toast: document.body.innerText.indexOf('已加入') >= 0 }; })()", true);
check('点击加入计划后写入 todos', applied && applied.count === data.tasks.length && applied.tasks === data.tasks.length, applied);
check('重复加入会跳过已有任务', applied && applied.added === 0 && applied.skipped === data.tasks.length && applied.countAfter === data.tasks.length, applied);
check('加入成功有提示', applied && applied.toast === true, applied);

await evaluate('location.hash = "#/plan"; "ok"');
await sleep(1100);
const planPage = await evaluate("(() => { const t = document.body.innerText; return { route: location.hash, math: t.indexOf('数学 · ') >= 0, eng: t.indexOf('英语 · ') >= 0, subjectLabels: document.querySelectorAll('.plan-subject').length }; })()");
check('计划页能看到生成的目标任务与科目标签', planPage && planPage.route === '#/plan' && planPage.math && planPage.eng && planPage.subjectLabels > 0, planPage);

await evaluate('location.hash = "#/me"; "ok"');
await sleep(900);
const me = await evaluate("(() => ({ entry: !!document.querySelector('[data-act=\"goals\"]'), footer: document.body.innerText.indexOf('学习记录 v1.35') >= 0 }))()");
check('我的页有学习目标入口与 v1.24 页脚', me && me.entry && me.footer, me);

check('无未捕获异常', logs.length === 0, logs.slice(0, 5));
ws.close(); edge.kill(); server.kill();
await sleep(300);
const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(OUT, 'result25.json'), JSON.stringify({ results }, null, 2));
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
console.log('\n' + passed + '/' + results.length + ' 通过');
process.exit(passed === results.length ? 0 : 1);
