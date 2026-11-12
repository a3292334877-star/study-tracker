/* test10：v1.9 今日进度桌面小组件（版本号随 v1.14 更新）
   1) manifest：versionCode 16 / versionName 1.17 + APPWIDGET_UPDATE receiver + meta-data
   2) res：xml/widget_today（updatePeriodMs）+ drawable/widget_bg + layout/widget_today（三个 id）
   3) TodayWidgetProvider.java：PREFS 'widget' / 日期守卫 / updateAll / push / 点击拉起
   4) MainActivity：updateWidget 桥 + onCreate 初始化
   5) app.js：pushWidget + 订阅/启动时推送；sw v28；me 页脚 v1.24
   6) 浏览器（mock window.AndroidApp）：启动即推送一次（整数字符串）→ addSession 加 25 分钟
      → 推送次数增加且今日分钟数 +25 → 无异常
   用法：node _tools/test10.mjs <ROOT> <OUT> <EDGE>   （可选 ST_PORT / ST_DBG，默认 8130 / 9366） */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2];
const OUT = process.argv[3] || path.join(ROOT, '_shots');
const EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8130);
const DBG = Number(process.env.ST_DBG || 9366);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }

/* ---------- 1. 静态检查（不需要浏览器） ---------- */
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const manifestXml = read('android/AndroidManifest.xml');
const widgetJava = read('android/java/com/xuexijilu/TodayWidgetProvider.java');
const mainSrc = read('android/java/com/xuexijilu/MainActivity.java');
const appSrc = read('js/app.js');
const swSrc = read('sw.js');
const meSrc = read('js/views/me.js');
const xmlMeta = read('android/res/xml/widget_today.xml');
const bgXml = read('android/res/drawable/widget_bg.xml');
const layoutXml = read('android/res/layout/widget_today.xml');

check('manifest v1.21 + widget receiver', manifestXml.includes('android:versionCode="27"')
  && manifestXml.includes('android:versionName="1.28"')
  && manifestXml.includes('.TodayWidgetProvider')
  && manifestXml.includes('android.appwidget.action.APPWIDGET_UPDATE')
  && manifestXml.includes('@xml/widget_today'), true);
check('res/appwidget-provider 就绪', xmlMeta.includes('<appwidget-provider') && xmlMeta.includes('updatePeriodMillis="1800000"')
  && xmlMeta.includes('initialLayout="@layout/widget_today"'), true);
check('res 背景与布局就绪', bgXml.includes('<corners android:radius="16dp"/>') && bgXml.includes('#232B38')
  && layoutXml.includes('@+id/widget_root') && layoutXml.includes('@+id/widget_min') && layoutXml.includes('@+id/widget_streak'), true);
check('TodayWidgetProvider 就绪', widgetJava.includes('PREFS = "widget"') && widgetJava.includes('KEY_DATE')
  && widgetJava.includes('today().equals') && widgetJava.includes('updateAll')
  && widgetJava.includes('getLaunchIntentForPackage') && widgetJava.includes('FLAG_IMMUTABLE')
  && widgetJava.includes('今天还没记录') && widgetJava.includes('打开应用记一笔') && widgetJava.includes('已连续记录'), true);
check('MainActivity 桥就绪', mainSrc.includes('public void updateWidget(final String minutes, final String streak)')
  && mainSrc.includes('TodayWidgetProvider.push(MainActivity.this, minutes, streak)')
  && mainSrc.includes('TodayWidgetProvider.updateAll(this);'), true);
check('app.js 推送钩子', appSrc.includes('minutesOfDay, streak') && appSrc.includes('dateKey')
  && appSrc.includes('function pushWidget()') && appSrc.includes("bridge.updateWidget(String(minutesOfDay(dateKey(new Date()))), String(streak()))")
  && (appSrc.match(/pushWidget\(\);/g) || []).length >= 2, true);
check('sw v28 + 页脚 v1.24', swSrc.includes("const CACHE = 'study-tracker-v33';") && meSrc.includes('学习记录 v1.28'), true);

/* ---------- 2. 启动静态服务器 + Edge（注入 mock AndroidApp） ---------- */
const dirname = path.dirname(fileURLToPath(import.meta.url));
const server = spawn(process.execPath, [path.join(dirname, 'server.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
await sleep(600);

const userDir = path.join(OUT, '_profile10-' + PORT);
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
  fs.writeFileSync(path.join(OUT, 'result10.json'), JSON.stringify({ results }, null, 2));
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

// 每个 new document 之前注入 mock 壳：记录所有 updateWidget 调用
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__widgetCalls = [];
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
    getDailyReminder: function () { return ''; },
    setDailyReminder: function () { return true; },
    updateWidget: function (minutes, streak) { window.__widgetCalls.push([String(minutes), String(streak)]); }
  };
` });

const URL = 'http://127.0.0.1:' + PORT + '/index.html';
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate('localStorage.clear(); location.reload(); "ok"');
await sleep(1800);

/* ---------- 3. 启动即推送：次数 >=1，参数为整数字符串 ---------- */
const boot1 = await evaluate("(() => ({ n: window.__widgetCalls.length, calls: window.__widgetCalls }))()");
const intsOk = (boot1.calls || []).every((c) => /^\d+$/.test(c[0]) && /^\d+$/.test(c[1]));
check('启动即推送（整数字符串）', boot1.n >= 1 && intsOk, boot1);
const firstMin = boot1.calls.length ? Number(boot1.calls[0][0]) : -1;

/* ---------- 4. addSession +25 分钟 → 推送次数增加且今日分钟 +25 ---------- */
await evaluate(`(async () => {
  const st = await import('./js/store.js');
  const subjects = st.getState().subjects;
  st.addSession({ subjectId: subjects[0] ? subjects[0].id : null, minutes: 25, title: '小组件验证', start: Date.now() - 25 * 60000, end: Date.now(), tags: [] });
})()`, true);
await sleep(900);
const after = await evaluate("(() => ({ n: window.__widgetCalls.length, calls: window.__widgetCalls }))()");
const lastMin = after.calls.length ? Number(after.calls[after.calls.length - 1][0]) : -1;
check('记录后再次推送且 +25 分钟', after.n > boot1.n && lastMin >= firstMin + 25, { bootN: boot1.n, afterN: after.n, firstMin, lastMin });

check('无异常', logs.length === 0, logs.slice(0, 3));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result10.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('[test10] ' + (results.length - failed.length) + '/' + results.length + ' 通过');
ws.close(); edge.kill(); server.kill();
process.exit(failed.length ? 1 : 0);