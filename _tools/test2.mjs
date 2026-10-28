import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8123), DBG = Number(process.env.ST_DBG || 9336);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile4');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=390,844',`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map(); const logs=[];
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return;} if(m.method==='Runtime.exceptionThrown'){logs.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));} if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){logs.push('ERR '+(m.params.args||[]).map(a=>a.value||a.description).join(' '));}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
const results=[];
const check=(n,ok,d)=>results.push({n,ok:!!ok,d});
const URL=`http://127.0.0.1:${PORT}/index.html`;

// 1. 清空数据后刷新，不应复活示例数据
await send('Page.navigate',{url:URL+'#/me'}); await sleep(1200);
const before = await evaluate("JSON.parse(localStorage.getItem('study-tracker/v1')).subjects.length");
await evaluate("(async()=>{const m=await import('./js/store.js'); m.resetAll(); return true;})()", true);
await sleep(300);
await send('Page.reload'); await sleep(1200);
const afterReset = await evaluate(`(() => {
  const s = JSON.parse(localStorage.getItem('study-tracker/v1'));
  return { subjects: s.subjects.length, sessions: s.sessions.length, seeded: s.seeded,
    rows: document.querySelectorAll('[data-subject]').length,
    homeEmpty: document.body.innerText.includes('还没有') || true };
})()`);
check('清空后不复活示例数据', before >= 4 && afterReset.subjects === 0 && afterReset.seeded === true, { before, afterReset });

// 2. 空数据下各页面不崩
for (const r of ['#/home','#/log','#/subjects','#/stats','#/timer','#/me']) {
  await evaluate(`location.hash='${r}'`); await sleep(500);
  const info = await evaluate("({ title: document.querySelector('#page-title')?.textContent, len: document.querySelector('#view')?.innerHTML.length })");
  check('空数据渲染 ' + r, info && info.len > 50, info);
}
await evaluate("location.hash='#/subjects'"); await sleep(400);
const emptySubjects = await evaluate("document.querySelector('#view')?.innerText.includes('还没有') || document.querySelector('#view')?.innerText.includes('添加')");
check('空科目页有引导', !!emptySubjects, { emptySubjects });
await send('Page.navigate',{url:URL+'#/home'}); await sleep(900);
const shotRes = await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(path.join(OUT,'20-empty-home.png'), Buffer.from(shotRes.data,'base64'));

// 3. 导出 / 导入
await send('Page.navigate',{url:URL+'#/me'}); await sleep(1000);
const exp = await evaluate("(async()=>{const m=await import('./js/store.js'); return m.exportJSON();})()", true);
check('导出 JSON 可用', typeof exp === 'string' && exp.length > 20, { len: exp && exp.length, head: typeof exp === 'string' ? exp.slice(0, 60) : exp });

const imp = await evaluate(`(async()=>{
  const m = await import('./js/store.js');
  const payload = { version: 1, settings: { theme:'auto', dailyGoalMin: 90, weekStart: 1, pomodoroMin: 30 },
    subjects: [{ id:'s1', name:'导入科目', emoji:'🧪', color:'#12b76a' }],
    sessions: [{ id:'x1', subjectId:'s1', start: Date.now()-3600000, end: Date.now(), minutes: 60, note:'导入' }],
    todos: [{ id:'t1', text:'导入任务', done:false }], reviews: [] };
  const ok = m.importJSON(JSON.stringify(payload));
  return { ok, subj: m.getState().subjects.length, sess: m.getState().sessions.length, goal: m.getState().settings.dailyGoalMin };
})()`, true);
check('导入 JSON 生效', imp && imp.ok && imp.subj === 1 && imp.sess === 1 && imp.goal === 90, imp);

// 4. 导入后首页显示
await evaluate("location.hash='#/home'"); await sleep(800);
const homeImp = await evaluate("({ hero: document.querySelector('.hero-value b')?.textContent, sessions: document.querySelectorAll('[data-session]').length })");
check('导入数据出现在首页', homeImp.hero === '1小时' || homeImp.sessions === 1, homeImp);

// 5. Service Worker 注册
const sw = await evaluate("(async()=>{const r = await navigator.serviceWorker.getRegistrations(); return r.length;})()", true);
check('Service Worker 已注册', sw >= 1, { regs: sw });

// 6. 离线可用：断网后重载
await send('Network.enable');
await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
await send('Page.reload'); await sleep(1500);
const offline = await evaluate("({ title: document.querySelector('#page-title')?.textContent, html: document.querySelector('#view')?.innerHTML.length })");
check('离线可打开', offline && offline.title === '今日' && offline.html > 100, offline);
await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});

// 7. 深色模式持久化
await evaluate("location.hash='#/me'"); await sleep(600);
await evaluate("document.querySelector('#theme-btn').click()"); await sleep(400);
await send('Page.reload'); await sleep(1200);
const darkPersist = await evaluate("document.documentElement.dataset.theme");
check('主题持久化', darkPersist === 'dark', { darkPersist });

check('无控制台错误', logs.length === 0, logs.slice(0,5));

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result2.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results,null,2));
console.log(`[test2] ${results.length - failed.length}/${results.length} 通过`);
ws.close(); edge.kill(); process.exit(failed.length ? 1 : 0);
