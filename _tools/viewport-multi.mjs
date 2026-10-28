import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = 8123, DBG = 9351;
const VW = Number(process.argv[5] || 390), VH = Number(process.argv[6] || 844);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profileVP');
fs.rmSync(userDir, { recursive: true, force: true });
const edge = spawn(EDGE, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--force-device-scale-factor=2','--window-size=' + VW + ',' + VH,`--user-data-dir=${userDir}`,`--remote-debugging-port=${DBG}`,'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i=0;i<60;i++){ try { const l = JSON.parse(await get(`http://127.0.0.1:${DBG}/json/list`)); const p = l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} } catch(_){} await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const send=(method,params={})=>{const i=++id;ws.send(JSON.stringify({id:i,method,params}));return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej}));};
const evaluate=async(expr,aw=false)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:aw,userGesture:true});if(r.exceptionDetails)return{__error:r.exceptionDetails.exception?.description};return r.result.value;};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:VW,height:VH,deviceScaleFactor:2,mobile:true});

const routes = ['#/home','#/log','#/subjects','#/timer','#/stats?range=week','#/me'];
const out = {};
for (const r of routes) {
  await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/index.html${r}`});
  await sleep(1100);
  await evaluate('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(500);
  const info = await evaluate(`(() => {
    const bar = document.querySelector('#tabbar').getBoundingClientRect();
    const vh = window.innerHeight;
    // 找出所有可点击元素，检查是否有被 tabbar 遮挡的
    const nodes = [...document.querySelectorAll('#view button, #view .row, #view input')];
    const covered = nodes.filter(n => {
      const b = n.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      if (b.bottom <= 0 || b.top >= vh) return false;
      return b.top < bar.top && b.bottom > bar.top;
    }).map(n => (n.id || n.dataset.act || n.textContent.trim().slice(0,14)));
    return {
      page: document.querySelector('#page-title')?.textContent,
      scrollH: document.documentElement.scrollHeight,
      viewH: vh,
      maxScroll: document.documentElement.scrollHeight - vh,
      barTop: Math.round(bar.top),
      covered,
      lastElBottom: Math.round(nodes[nodes.length-1]?.getBoundingClientRect().bottom || 0),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 ? document.documentElement.scrollWidth : 0,
      wide: [...document.querySelectorAll('#view *')].filter(n => n.getBoundingClientRect().right > window.innerWidth + 1).slice(0,4).map(n => n.className || n.tagName),
    };
  })()`);
  const safe = r.replace(/[#\/?=]/g,'_');
  const res = await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(OUT,'vp'+VW+'x'+VH+safe+'.png'), Buffer.from(res.data,'base64'));
  out[r] = info;
}
console.log(JSON.stringify(out,null,2));
ws.close(); edge.kill(); process.exit(0);
