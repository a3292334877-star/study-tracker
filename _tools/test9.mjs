/* test9：v1.8 Android 每日定时提醒
   1) manifest：RECEIVE_BOOT_COMPLETED / SCHEDULE_EXACT_ALARM 权限 + 两个 receiver 声明
   2) ReminderScheduler / DailyReminderReceiver / BootReceiver / MainActivity 桥 静态就绪
   3) me.js：每日提醒行入口 + 预设时间 + 页脚 v1.24
   4) 浏览器（mock window.AndroidApp）：行出现 → 打开 sheet（6 预设、当前时间高亮）
      → 选 21:00 保存 → 桥收到 (21:00,true) 且行刷新 → 关闭提醒 → 桥收到 false 且行显示「关」
   用法：node _tools/test9.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8129 / 9364） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8129);
const DBG = Number(process.env.ST_DBG || 9364);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查（不需要浏览器） ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const manifestXml = read('android/AndroidManifest.xml');
const meSrc = read('js/views/me.js');
const schedSrc = read('android/java/com/xuexijilu/ReminderScheduler.java');
const recvSrc = read('android/java/com/xuexijilu/DailyReminderReceiver.java');
const bootSrc = read('android/java/com/xuexijilu/BootReceiver.java');
const mainSrc = read('android/java/com/xuexijilu/MainActivity.java');

check('manifest 提醒权限', manifestXml.includes('RECEIVE_BOOT_COMPLETED') && manifestXml.includes('SCHEDULE_EXACT_ALARM'),
  { boot: manifestXml.includes('RECEIVE_BOOT_COMPLETED'), exact: manifestXml.includes('SCHEDULE_EXACT_ALARM') });
check('manifest receiver 声明', manifestXml.includes('.DailyReminderReceiver') && manifestXml.includes('.BootReceiver')
  && manifestXml.includes('android.intent.action.BOOT_COMPLETED'), true);
check('ReminderScheduler 就绪', schedSrc.includes('setExactAndAllowWhileIdle') && schedSrc.includes('setWindow')
  && schedSrc.includes('canScheduleExactAlarms') && schedSrc.includes('RTC_WAKEUP') && schedSrc.includes('FLAG_IMMUTABLE'), true);
check('提醒接收器 + 开机接收器就绪', recvSrc.includes('daily_reminder') && recvSrc.includes('notify(')
  && recvSrc.includes('ReminderScheduler.apply(context)') && bootSrc.includes('ACTION_BOOT_COMPLETED'), true);
check('MainActivity 提醒桥就绪', mainSrc.includes('getDailyReminder') && mainSrc.includes('setDailyReminder')
  && mainSrc.includes('createReminderChannel'), true);
check('me.js 每日提醒入口', meSrc.includes('data-act="daily-reminder"') && meSrc.includes('getDailyReminder')
  && meSrc.includes('setDailyReminder') && meSrc.includes('REMINDER_PRESETS') && meSrc.includes('学习记录 v1.34'), true);

/* ---------- 2. 启动静态服务器 + Edge（注入 mock AndroidApp） ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile9-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result9.json'), JSON.stringify({ results }, null, 2));
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

// 每个 new document 之前注入 mock 壳：记录所有 setDailyReminder 调用，getDailyReminder 返回当前状态
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__remCalls = [];
  window.__remState = '';
  window.__remOn = true;
  window.AndroidApp = {
    isApp: function () { return true; },
    setTheme: function () {},
    haptic: function () {},
    toast: function () {},
    saveImage: function () { return true; },
    saveBackupQuietly: function () {},
    saveFile: function () {},
    updateTimerNotification: function () {},
    stopTimerNotification: function () {},
    notifPermissionGranted: function () { return true; },
    openNotifSettings: function () {},
    getDailyReminder: function () { return window.__remOn ? (window.__remState || '20:00') : ''; },
    setDailyReminder: function (t, en) { window.__remCalls.push([String(t), Boolean(en)]); if (en) { window.__remState = String(t); window.__remOn = true; } else { window.__remOn = false; } return true; }
  };
` });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL + '#/me' });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);
await evaluate("location.hash='#/me'"); await sleep(900);

/* ---------- 3. 每日提醒行出现（桥可用时） ---------- */
const row1 = await evaluate("(() => ({ found: !!document.querySelector('[data-act=daily-reminder]'), val: (document.querySelector('#daily-reminder-val')||{}).textContent }))()");
check('每日提醒行出现（默认 20:00）', row1.found && row1.val === '20:00', row1);

/* ---------- 4. 打开 sheet：标题 / 预设数量 / 当前高亮 ---------- */
await evaluate("document.querySelector('[data-act=daily-reminder]').click()");
await sleep(600);
const sheet1 = await evaluate("(() => ({ hidden: document.querySelector('#sheet').hidden, title: (document.querySelector('#sheet .sheet-title')||{}).textContent, chips: document.querySelectorAll('#sheet [data-time]').length, onChip: (document.querySelector('#sheet .chip.on')||{}).textContent }))()");
check('提醒 sheet 内容', !sheet1.hidden && sheet1.title === '每日提醒' && sheet1.chips === 6 && sheet1.onChip === '20:00', sheet1);

/* ---------- 5. 选 21:00 保存 → 桥调用 + 行刷新 ---------- */
await evaluate("[...document.querySelectorAll('#sheet [data-time]')].find(b => b.textContent === '21:00').click()");
await sleep(200);
await evaluate("[...document.querySelectorAll('#sheet [data-act]')].find(b => b.textContent === '保存').click()");
await sleep(900);
const after1 = await evaluate("(() => ({ calls: window.__remCalls, state: window.__remState, hidden: document.querySelector('#sheet').hidden, val: (document.querySelector('#daily-reminder-val')||{}).textContent }))()");
check('保存 → 桥收到 (21:00,true) 且行刷新', Array.isArray(after1.calls) && after1.calls.length === 1
  && after1.calls[0][0] === '21:00' && after1.calls[0][1] === true && after1.state === '21:00'
  && after1.hidden && after1.val === '21:00', after1);

/* ---------- 6. 关闭提醒 → 桥收到 false 且行显示「关」 ---------- */
await evaluate("document.querySelector('[data-act=daily-reminder]').click()");
await sleep(600);
const sheet2 = await evaluate("(document.querySelector('#sheet .chip.on')||{}).textContent");
check('重开 sheet 高亮 21:00', sheet2 === '21:00', sheet2);
await evaluate("[...document.querySelectorAll('#sheet [data-act]')].find(b => b.textContent === '关闭提醒').click()");
await sleep(900);
const after2 = await evaluate("(() => ({ calls: window.__remCalls, state: window.__remState, hidden: document.querySelector('#sheet').hidden, val: (document.querySelector('#daily-reminder-val')||{}).textContent }))()");
check('关闭提醒 → 桥收到 false 且行显示关', Array.isArray(after2.calls) && after2.calls.length === 2
  && after2.calls[1][0] === '21:00' && after2.calls[1][1] === false
  && after2.hidden && after2.val === '关', after2);

check('无异常', logs.length === 0, logs.slice(0, 3));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result9.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('[test9] ' + (results.length - failed.length) + '/' + results.length + ' 通过');
ws.close(); edge.kill(); server.kill();
process.exit(failed.length ? 1 : 0);
