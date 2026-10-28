import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9337;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile5');
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
const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,name+'.png'), Buffer.from(r.data,'base64'));};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
const URL=`http://127.0.0.1:${PORT}/index.html`;

// 1. 首页添加任务弹层
await send('Page.navigate',{url:URL+'#/home'}); await sleep(1300);
await evaluate("document.querySelector('[data-act=\"add-todo\"]').click()"); await sleep(500);
await shot('30-prompt-todo');

// 2. 删除记录确认弹层
await evaluate("document.querySelector('#sheet-backdrop').click()"); await sleep(400);
await evaluate("(async()=>{const m=await import('./js/store.js'); const st=m.getState(); if(!st.sessions.length){ m.addSubject({name:'测试',emoji:'📘',color:'#4f6df5'}); const s=m.getState().subjects[0]; m.addSession({subjectId:s.id,start:Date.now()-1800000,end:Date.now(),minutes:30,note:''}); } return true;})()", true);
await sleep(400);
await evaluate("location.hash='#/timer'; setTimeout(()=>location.hash='#/home',100);"); await sleep(1200);
const hasRow = await evaluate("document.querySelectorAll('[data-session]').length");
if (hasRow) { await evaluate("document.querySelector('[data-session]').click()"); await sleep(500); await shot('31-confirm-delete'); await evaluate("document.querySelector('[data-act=\"no\"]').click()"); await sleep(400); }

// 3. 清空数据确认（深色）
await evaluate("location.hash='#/me'"); await sleep(700);
await evaluate("document.documentElement.dataset.theme='dark'"); await sleep(300);
await evaluate("document.querySelector('[data-act=\"reset\"]').click()"); await sleep(600);
await shot('32-confirm-reset-dark');
await evaluate("document.querySelector('[data-act=\"no\"]').click()"); await sleep(400);

// 4. 科目编辑页的删除二次确认
await evaluate("document.documentElement.dataset.theme='light'");
await evaluate("location.hash='#/subjects'"); await sleep(800);
await evaluate("document.querySelector('[data-subject]').click()"); await sleep(600);
await shot('33-subject-edit');
const delBtn = await evaluate("Boolean(document.querySelector('[data-act=\"delete\"]'))");
if (delBtn) { await evaluate("document.querySelector('[data-act=\"delete\"]').click()"); await sleep(500); await shot('34-subject-delete-confirm'); }

console.log(JSON.stringify({ hasRow, delBtn, logs }, null, 2));
ws.close(); edge.kill(); process.exit(0);
