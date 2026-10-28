import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9334;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });

const userDir = path.join(OUT, '_profile2');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=390,844',`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});

async function fullShot(hash, name, scrollY=0){
  await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html${hash}`});
  await sleep(1100);
  if (scrollY) { await evaluate(`window.scrollTo(0,${scrollY})`); await sleep(400); }
  const m = await send('Page.getLayoutMetrics');
  const h = Math.ceil(m.cssContentSize.height);
  const res = await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:h,scale:2}});
  fs.writeFileSync(path.join(OUT,name+'.png'), Buffer.from(res.data,'base64'));
  return h;
}

const out = {};
out.statsFull = await fullShot('#/stats?range=week','full-stats');
out.homeFull = await fullShot('#/home','full-home');
out.logFull = await fullShot('#/log','full-log');
out.meFull = await fullShot('#/me','full-me');
out.timerFull = await fullShot('#/timer','full-timer');

// 检查热力图
await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html#/stats`});
await sleep(1000);
out.heat = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.card')];
  const card = cards.find(c => c.textContent.includes('记录热力'));
  const grid = card.querySelector('div[style*="grid"]');
  const cells = [...grid.children];
  const filled = cells.filter(c => !c.style.background.includes('6%')).length;
  return { cells: cells.length, filled, first: cells[0].title, last: cells[cells.length-1].title, today: new Date().toISOString().slice(0,10) };
})()`);

out.timerScroll = await evaluate(`(() => {
  const v = document.querySelector('#view');
  return { scrollH: document.body.scrollHeight, clientH: window.innerHeight, canScroll: document.body.scrollHeight > window.innerHeight };
})()`);

// 计时页滚动到底，看按钮是否被 tabbar 遮挡
await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html#/timer`});
await sleep(1000);
await evaluate('window.scrollTo(0, document.body.scrollHeight)');
await sleep(400);
const m = await send('Page.getLayoutMetrics');
const res = await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(path.join(OUT,'full-timer-bottom.png'), Buffer.from(res.data,'base64'));
out.timerBottom = await evaluate(`(() => {
  const btn = document.querySelector('#btn-manual');
  const r = btn.getBoundingClientRect();
  const bar = document.querySelector('#tabbar').getBoundingClientRect();
  return { btnBottom: Math.round(r.bottom), barTop: Math.round(bar.top), covered: r.bottom > bar.top };
})()`);

console.log(JSON.stringify(out,null,2));
ws.close(); edge.kill(); process.exit(0);
