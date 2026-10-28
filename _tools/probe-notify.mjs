import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9345;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile13');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=390,844',`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl=null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map(); const logs=[];
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return;} if(m.method==='Runtime.exceptionThrown'){logs.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));} if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error'){logs.push('ERR '+JSON.stringify(m.params.args.map(a=>a.value||a.description)));}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html#/me`}); await sleep(1500);
const before = await evaluate("Notification.permission");
await evaluate("document.querySelector('[data-act=\"notify\"]').click()"); await sleep(1200);
const st = await evaluate(`(() => ({
  sheetOpen: !document.querySelector('#sheet').hidden,
  sheetText: document.querySelector('#sheet').innerText.slice(0,80),
  toast: document.querySelector('#toast').innerText,
}))()`);
const after = await evaluate("Notification.permission");
const shot = await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(path.join(OUT,'82-notify-denied.png'), Buffer.from(shot.data,'base64'));
console.log(JSON.stringify({ before, after, st, logs }, null, 2));
ws.close(); edge.kill(); process.exit(0);
