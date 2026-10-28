import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9346;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile11');
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
const shot=async(n)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n+'.png'), Buffer.from(r.data,'base64'));};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
const URL=`http://127.0.0.1:${PORT}/index.html`;

const out = {};
await send('Page.navigate',{url:URL+'#/home'}); await sleep(1500);

// 记一笔弹层（浅色）
await evaluate("document.querySelector('[data-add-record]').click()"); await sleep(700);
await shot('90-record-sheet-light');
out.light = await evaluate(`(() => {
  const sheet = document.querySelector('#sheet');
  const actions = sheet.querySelector('.sheet-actions');
  const sr = sheet.getBoundingClientRect();
  const ar = actions.getBoundingClientRect();
  const fields = [...sheet.querySelectorAll('.field label')].map(l=>l.textContent.trim());
  return { open: !sheet.hidden, sheetH: Math.round(sr.height), sheetTop: Math.round(sr.top),
    actionsBottom: Math.round(ar.bottom), sheetBottom: Math.round(sr.bottom),
    actionsVisible: ar.bottom <= sr.bottom + 1 && ar.top >= sr.top,
    fields, hasTitle: !!sheet.querySelector('#r-title'), hasDate: !!sheet.querySelector('#r-date'),
    hasNote: !!sheet.querySelector('#r-note'), quick: sheet.querySelectorAll('[data-min]').length };
})()`);

// 填一点内容再看
await evaluate(`(() => {
  document.querySelector('#r-title').value = '线性代数：特征值与特征向量';
  document.querySelector('#r-minutes').value = '45';
  document.querySelector('#r-note').value = '相似对角化的条件还没完全想通，明天问一下。';
  document.querySelector('#r-date').dispatchEvent(new Event('change', {bubbles:true}));
  return true;
})()`);
await sleep(200);
await shot('91-record-sheet-filled');

// 深色
await evaluate("document.querySelector('#sheet-backdrop').click()"); await sleep(500);
await evaluate("document.documentElement.dataset.theme='dark'"); await sleep(300);
await evaluate("document.querySelector('[data-add-record]').click()"); await sleep(700);
await shot('92-record-sheet-dark');
await evaluate("document.querySelector('#sheet-backdrop').click()"); await sleep(500);

// 记录页深色
await evaluate("location.hash='#/log'"); await sleep(1200);
await shot('93-log-dark');
await evaluate("document.documentElement.dataset.theme='light'"); await sleep(300);

// 搜索态
await evaluate("location.hash='#/timer'; setTimeout(()=>{location.hash='#/log';},60)"); await sleep(1200);
await evaluate(`(() => { const i = document.querySelector('#log-q'); i.value='导数'; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
await sleep(500);
await shot('94-log-search');
out.search = await evaluate("({ count: document.querySelector('#log-count')?.textContent.trim(), rows: document.querySelectorAll('#log-body [data-session]').length })");

// 空搜索结果
await evaluate(`(() => { const i = document.querySelector('#log-q'); i.value='zzzz没有这个'; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
await sleep(500);
await shot('95-log-noresult');
out.empty = await evaluate("document.querySelector('#log-body .empty')?.innerText");

// 筛选近 7 天
await evaluate(`(() => { const i = document.querySelector('#log-q'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
await sleep(400);
await evaluate("document.querySelector('[data-filter=\"week\"]').click()"); await sleep(500);
await shot('96-log-week');
out.week = await evaluate("({ count: document.querySelector('#log-count')?.textContent.trim(), days: document.querySelectorAll('#log-body .tl-day').length })");

console.log(JSON.stringify({ out, logs }, null, 2));
ws.close(); edge.kill(); process.exit(0);
