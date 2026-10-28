import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2];
const OUT = process.argv[3];
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8123);
const DBG = Number(process.env.ST_DBG || 9333);

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

/* ---------- 启动 Edge ---------- */
const userDir = path.join(OUT, '_profile');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--window-size=390,844',
  `--user-data-dir=${userDir}`,
  `--remote-debugging-port=${DBG}`,
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i += 1) {
  try {
    const list = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`));
    const page = list.find((t) => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch (_) {}
  await sleep(250);
}
if (!wsUrl) { console.error('no devtools'); process.exit(1); }

/* ---------- CDP 客户端 ---------- */
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const events = [];
const logs = [];

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push({ type: msg.params.type, text });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push({ type: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push({ type: 'log:' + msg.params.entry.level, text: msg.params.entry.text + ' ' + (msg.params.entry.url || '') });
  }
  events.push(msg);
};

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expr, awaitPromise = false) {
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    return { __error: res.exceptionDetails.exception?.description || res.exceptionDetails.text };
  }
  return res.result.value;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(res.data, 'base64'));
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

async function goto(hash) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${hash}` });
  await sleep(900);
}

/* ---------- 测试 ---------- */
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const URL = `http://127.0.0.1:${PORT}/index.html`;

// 1. 首屏
await send('Page.navigate', { url: URL + '#/home' });
await sleep(1200);
await shot('01-home');

const homeInfo = await evaluate(`(() => {
  const q = (s) => document.querySelector(s);
  return {
    title: q('#page-title')?.textContent,
    hero: q('.hero-value b')?.textContent,
    statCards: document.querySelectorAll('.stat').length,
    sessions: document.querySelectorAll('[data-session]').length,
    todos: document.querySelectorAll('[data-todo]').length,
    hasTabbar: Boolean(q('#tabbar')),
    activeTab: q('.tab.active')?.dataset.route,
  };
})()`);
check('首页渲染', homeInfo.title === '今日' && homeInfo.statCards === 3, homeInfo);

// 2. 科目页
await evaluate("location.hash = '#/subjects'");
await sleep(600);
await shot('02-subjects');
const subjInfo = await evaluate(`(() => ({
  title: document.querySelector('#page-title')?.textContent,
  rows: document.querySelectorAll('[data-subject]').length,
}))()`);
check('科目页渲染', subjInfo.rows >= 4, subjInfo);

// 3. 打开新建科目弹层
await evaluate("document.querySelector('[data-act=\"add\"]').click()");
await sleep(500);
await shot('03-subject-sheet');
const sheetInfo = await evaluate(`(() => ({
  open: !document.querySelector('#sheet').hidden,
  title: document.querySelector('.sheet-title')?.textContent,
  emojis: document.querySelectorAll('[data-emoji]').length,
  colors: document.querySelectorAll('[data-color]').length,
}))()`);
check('新建科目弹层', sheetInfo.open && sheetInfo.emojis > 0, sheetInfo);

// 输入名称并保存
await evaluate(`(() => {
  document.querySelector('#sub-name').value = '操作系统';
  document.querySelector('[data-act="save"]').click();
  return true;
})()`);
await sleep(700);
const afterCreate = await evaluate(`(() => ({
  rows: document.querySelectorAll('[data-subject]').length,
  names: [...document.querySelectorAll('[data-subject] .row-title')].map(e => e.textContent),
  sheetHidden: document.querySelector('#sheet').hidden,
}))()`);
check('新建科目成功', Boolean(afterCreate && Array.isArray(afterCreate.names) && afterCreate.names.includes('操作系统') && afterCreate.sheetHidden), afterCreate);

// 4. 计时页
await evaluate("location.hash = '#/timer'");
await sleep(600);
await shot('04-timer-idle');
const timerInfo = await evaluate(`(() => ({
  title: document.querySelector('#page-title')?.textContent,
  time: document.querySelector('#ring-time')?.textContent,
  state: document.querySelector('#ring-state')?.textContent,
  main: document.querySelector('#btn-main')?.textContent,
  modes: document.querySelectorAll('[data-mode]').length,
  styles: document.querySelectorAll('[data-style]').length,
  onStyle: document.querySelector('[data-style].on')?.dataset.style,
}))()`);
check('计时页初始（正计时 00:00）',
  timerInfo.time === '00:00' && timerInfo.main === '开始' && timerInfo.onStyle === 'up', timerInfo);

// 开始计时
await evaluate("document.querySelector('#btn-main').click()");
await sleep(1600);
await shot('05-timer-running');
const running = await evaluate(`(() => ({
  time: document.querySelector('#ring-time')?.textContent,
  state: document.querySelector('#ring-state')?.textContent,
  main: document.querySelector('#btn-main')?.textContent,
  offset: document.querySelector('#ring-prog')?.getAttribute('stroke-dashoffset'),
}))()`);
check('计时运行中（正计时走秒）',
  running.state === '专注中' && running.main === '暂停' && /^00:0[0-9]$/.test(running.time), running);

// 暂停
await evaluate("document.querySelector('#btn-main').click()");
await sleep(400);
const paused = await evaluate(`(() => ({
  state: document.querySelector('#ring-state')?.textContent,
  main: document.querySelector('#btn-main')?.textContent,
}))()`);
check('暂停生效', paused.state === '已暂停' && paused.main === '继续', paused);

// 恢复并结束（模拟已进行 12 分钟）
await evaluate(`(async () => {
  const mod = await import('./js/timer.js');
  mod.start();
  // 直接篡改内部累计时间，模拟已专注 12 分钟
  const t = mod.getTimer();
  t.accumulatedMs = 12 * 60000;
  return true;
})()`, true);
await sleep(300);
await evaluate(`(async () => {
  const mod = await import('./js/timer.js');
  mod.pause();
  const res = mod.finish({ early: true });
  window.__finish = res;
  return res;
})()`, true);
await sleep(600);
const finished = await evaluate("window.__finish");
check('结束计时落库', finished && finished.ok && finished.minutes >= 11, finished);

// 5. 首页应出现新记录
await evaluate("location.hash = '#/home'");
await sleep(700);
await shot('06-home-after');
const homeAfter = await evaluate(`(() => ({
  hero: document.querySelector('.hero-value b')?.textContent,
  sessions: document.querySelectorAll('[data-session]').length,
  firstTitle: document.querySelector('[data-session] .rec-title')?.textContent,
}))()`);
check('记录写入首页', homeAfter.sessions >= 1, homeAfter);

// 6. 统计页
await evaluate("location.hash = '#/stats?range=week'");
await sleep(700);
await shot('07-stats');
const statsInfo = await evaluate(`(() => ({
  title: document.querySelector('#page-title')?.textContent,
  bars: document.querySelectorAll('.card')[0]?.querySelectorAll('.chart-bar').length,
  subjects: document.querySelectorAll('.bar-line').length,
  seg: document.querySelectorAll('[data-range]').length,
  heat: document.querySelectorAll('.heatmap div[title]').length,
}))()`);
check('统计页渲染', statsInfo.bars === 7 && statsInfo.seg === 3, statsInfo);

// 切换范围
await evaluate("document.querySelector('[data-range=\"month\"]').click()");
await sleep(700);
const monthInfo = await evaluate(`(() => ({
  hash: location.hash,
  bars: document.querySelectorAll('.chart-bar').length,
  on: document.querySelector('[data-range].on')?.dataset.range,
}))()`);
check('统计切换范围', monthInfo.on === 'month', monthInfo);

// 7. 我的页
await evaluate("location.hash = '#/me'");
await sleep(600);
await shot('08-me');
const meInfo = await evaluate(`(() => ({
  title: document.querySelector('#page-title')?.textContent,
  rows: document.querySelectorAll('[data-set]').length,
}))()`);
check('我的页渲染', meInfo.rows === 4, meInfo);

// 主题切换
const themeBefore = await evaluate("document.documentElement.dataset.theme");
await evaluate("document.querySelector('#theme-btn').click()");
await sleep(400);
const themeAfter = await evaluate("document.documentElement.dataset.theme");
check('主题切换', themeBefore !== themeAfter, { themeBefore, themeAfter });
await shot('09-me-dark');

// 8. 深色下首页
await evaluate("location.hash = '#/home'");
await sleep(700);
await shot('10-home-dark');

// 9. 数据持久化：刷新后仍在
await send('Page.reload');
await sleep(1200);
const persisted = await evaluate(`(() => ({
  hero: document.querySelector('.hero-value b')?.textContent,
  theme: document.documentElement.dataset.theme,
  sessions: document.querySelectorAll('[data-session]').length,
}))()`);
check('刷新后数据保留', persisted.sessions >= 1, persisted);

// 10. 倒计时模式
await evaluate("location.hash = '#/timer'");
await sleep(700);
await evaluate("document.querySelector('[data-style=\"down\"]').click()");
await sleep(400);
const downMode = await evaluate(`(() => ({
  time: document.querySelector('#ring-time')?.textContent,
  onStyle: document.querySelector('[data-style].on')?.dataset.style,
  presetsVisible: document.querySelector('#preset-chips')?.style.display !== 'none',
}))()`);
check('切换到倒计时', downMode.time === '25:00' && downMode.onStyle === 'down' && downMode.presetsVisible, downMode);
await shot('11-timer-down');

// 11. 休息模式：强制倒计时、不落库
await evaluate("document.querySelector('[data-mode=\"short\"]').click()");
await sleep(400);
const breakInfo = await evaluate(`(() => ({
  time: document.querySelector('#ring-time')?.textContent,
  state: document.querySelector('#ring-state')?.textContent,
  segHidden: document.querySelector('#style-seg')?.style.display === 'none',
  presetsHidden: document.querySelector('#preset-chips')?.style.display === 'none',
}))()`);
check('切换到短休息', breakInfo.time === '05:00' && breakInfo.segHidden && breakInfo.presetsHidden, breakInfo);
await shot('12-timer-break');

const breakResult = await evaluate(`(async () => {
  const mod = await import('./js/timer.js');
  mod.start();
  mod.getTimer().accumulatedMs = 5 * 60000;
  const res = mod.finish({ early: false });
  return res;
})()`, true);
check('休息结束不记入学习时长', breakResult && breakResult.ok === false && breakResult.minutes === 0, breakResult);

// 12. 手动补记
await evaluate("location.hash = '#/timer'");
await sleep(700);
const beforeManual = await evaluate("JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length");
await evaluate("document.querySelector('#btn-manual').click()");
await sleep(400);
await evaluate(`(() => {
  document.querySelector('#r-title').value = '手动补记测试';
  document.querySelector('#r-minutes').value = '45';
  document.querySelector('#r-note').value = '这条是手动补记的';
  document.querySelector('[data-act="save"]').click();
  return true;
})()`);
await sleep(600);
const afterManual = await evaluate("JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length");
check('手动补记落库', afterManual === beforeManual + 1, { beforeManual, afterManual });

// 13. 无报错
const errors = logs.filter((l) => l.type === 'exception' || l.type === 'error' || l.type === 'log:error');
check('控制台无错误', errors.length === 0, errors);

// 输出
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, logs }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ results, logs: logs.slice(0, 20) }, null, 2));
console.log(`[test] ${results.length - failed.length}/${results.length} 通过`);

ws.close();
edge.kill();
process.exit(failed.length ? 1 : 0);
