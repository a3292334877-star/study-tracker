import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9347;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile12');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=390,844',`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map(); const logs=[];
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);return;} if(m.method==='Runtime.exceptionThrown'){logs.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html#/stats?range=week`});
await sleep(1800);
const out = await evaluate(`(() => {
  const hero = document.querySelector('.hero-sub')?.textContent.trim();
  const heroVal = document.querySelector('.hero-value')?.textContent.replace(/\\s+/g,' ').trim();
  const cols = [...document.querySelectorAll('button.chart-col')].map(b => ({
    day: b.dataset.day,
    label: b.querySelector('.chart-label')?.textContent.trim(),
    h: Math.round(b.querySelector('.chart-bar')?.getBoundingClientRect().height || 0),
    tip: b.getAttribute('aria-label') || b.title || '',
  }));
  const dist = [...document.querySelectorAll('.dist-row, .bar-row')].map(r => r.textContent.replace(/\\s+/g,' ').trim());
  return { heroVal, hero, cols, dist };
})()`);
console.log(JSON.stringify({ out, logs }, null, 2));
ws.close(); edge.kill();
process.exit(0);
