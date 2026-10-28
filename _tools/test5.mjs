import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8123), DBG = Number(process.env.ST_DBG || 9341);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile9');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=390,844',`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map(); const logs=[];
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return;} if(m.method==='Runtime.exceptionThrown'){logs.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));} if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){logs.push('ERR '+JSON.stringify(m.params.args.map(a=>a.value||a.description)));}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};
const shot=async(n)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'), Buffer.from(r.data,'base64'));};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
const URL=`http://127.0.0.1:${PORT}/index.html`;
const results=[]; const check=(n,ok,d)=>results.push({n,ok:!!ok,d});

await send('Page.navigate',{url:URL+'#/me'}); await sleep(1600);

// 1. 「应用」分组存在
const appGroup = await evaluate("document.body.innerText.includes('添加到主屏幕')");
check('我的页有「添加到主屏幕」入口', appGroup, { appGroup });

// 2. 通知行存在并显示状态
const notifyRow = await evaluate(`(() => {
  const r = document.querySelector('[data-act="notify"]');
  return { exists: !!r, val: r ? r.querySelector('.row-val')?.textContent.trim() : null };
})()`);
check('通知行显示授权状态', notifyRow.exists && !!notifyRow.val, notifyRow);

// 2b. 「工具」分组里有计时入口
const toolRow = await evaluate(`(() => {
  const r = document.querySelector('[data-act="timer"]');
  return { exists: !!r, text: r ? r.innerText.replace(/\\s+/g,' ').trim() : null };
})()`);
check('我的页有「专注计时」入口', toolRow.exists && /专注计时/.test(toolRow.text || ''), toolRow);

// 2c. 「工具」分组里有科目管理入口
const subjRow = await evaluate(`(() => {
  const r = document.querySelector('[data-act="subjects"]');
  return { exists: !!r, text: r ? r.innerText.replace(/\\s+/g,' ').trim() : null };
})()`);
check('我的页有「科目管理」入口', subjRow.exists && /科目管理/.test(subjRow.text || ''), subjRow);

// 3. 点安装行弹出引导
await evaluate("document.querySelector('[data-act=\"install\"]').click()"); await sleep(600);
const installSheet = await evaluate(`(() => ({
  open: !document.querySelector('#sheet').hidden,
  title: document.querySelector('#sheet .sheet-title')?.textContent,
  steps: document.querySelectorAll('#sheet .steps li').length,
  hasClose: !!document.querySelector('#sheet [data-act="close"]'),
}))()`);
check('安装引导弹层有步骤', installSheet.open && installSheet.steps >= 2 && installSheet.hasClose, installSheet);
await shot('70-install-sheet');

// 4. 安装引导文案按平台区分（headless 为桌面 UA → 应含「安装」字样）
const installText = await evaluate("document.querySelector('#sheet').innerText");
check('安装文案非空且含指引', typeof installText === 'string' && installText.length > 20, { len: installText && installText.length });
await evaluate("document.querySelector('#sheet [data-act=\"close\"]').click()"); await sleep(400);
const closed = await evaluate("document.querySelector('#sheet').hidden");
check('关闭后弹层收起', closed, { closed });

// 5. install 模块导出可用
const mod = await evaluate(`(async () => {
  const m = await import('./js/install.js');
  return {
    isStandalone: m.isStandalone(),
    canInstall: m.canInstall(),
    ios: m.isIOS(),
    android: m.isAndroid(),
    hasPrompt: typeof m.promptInstall === 'function',
    steps: m.manualSteps().steps.length,
  };
})()`, true);
check('install 模块接口正常', mod && mod.hasPrompt && mod.steps >= 2 && mod.isStandalone === false, mod);

// 6. Service Worker 缓存了新模块
const swText = await evaluate(`fetch('sw.js').then(r=>r.text())`, true);
check('SW 预缓存 sheets.js 与 install.js', typeof swText === 'string' && swText.includes('./js/sheets.js') && swText.includes('./js/install.js'), { len: swText && swText.length });

// 7. 深色下安装弹层正常
await evaluate("document.documentElement.dataset.theme='dark'"); await sleep(200);
await evaluate("document.querySelector('[data-act=\"install\"]').click()"); await sleep(600);
await shot('71-install-sheet-dark');
const darkOk = await evaluate("!document.querySelector('#sheet').hidden");
check('深色模式弹层可打开', darkOk, { darkOk });
await evaluate("document.querySelector('#sheet-backdrop').click()"); await sleep(400);

// 8. 计时页仍正常（回归）
await evaluate("location.hash='#/timer'"); await sleep(1000);
const timerOk = await evaluate("!!document.querySelector('#ring-time') && document.querySelector('#ring-time').textContent === '00:00'");
check('计时页正常', timerOk, { timerOk });

// 9. 点「专注计时」跳到计时页
await evaluate("location.hash='#/me'"); await sleep(900);
await evaluate("document.querySelector('[data-act=\"timer\"]').click()"); await sleep(900);
const jumped = await evaluate("location.hash === '#/timer' && !!document.querySelector('#ring-time')");
check('点工具行可进入计时页', jumped, { hash: await evaluate("location.hash"), jumped });

// 10. 点「科目管理」跳到科目页
await evaluate("location.hash='#/me'"); await sleep(900);
await evaluate("document.querySelector('[data-act=\"subjects\"]').click()"); await sleep(900);
const jumped2 = await evaluate("location.hash === '#/subjects' && document.querySelectorAll('.card, .row').length > 0");
check('点科目管理可进入科目页', jumped2, { hash: await evaluate("location.hash"), jumped2 });

check('无异常', logs.length === 0, logs.slice(0,3));
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result5.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results,null,2));
console.log(`[test5] ${results.length - failed.length}/${results.length} 通过`);
ws.close(); edge.kill(); process.exit(failed.length ? 1 : 0);
