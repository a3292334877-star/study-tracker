import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8123), DBG = Number(process.env.ST_DBG || 9338);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile6');
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
const results=[]; const check=(n,ok,d)=>results.push({n,ok:!!ok,d});

await send('Page.navigate',{url:URL+'#/home'}); await sleep(1300);
// 保证今天有一条记录
await evaluate(`(async()=>{
  const m = await import('./js/store.js');
  const st = m.getState();
  if (!st.subjects.length) m.addSubject({ name:'测试科目', emoji:'📘', color:'#4f6df5' });
  const sid = m.getState().subjects[0].id;
  const today = m.sessionsOfDay();
  if (!today.length) m.addSession({ subjectId: sid, title: '可编辑的记录', start: Date.now()-1800000, end: Date.now(), minutes: 30, note: '' });
  return true;
})()`, true);
await sleep(300);
await evaluate("location.hash='#/timer'; setTimeout(()=>{location.hash='#/home';},60);"); await sleep(1200);
const before = await evaluate("(() => { const s = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = s.sessions.find(x=>new Date(x.end).toDateString()===new Date().toDateString()); return t ? { id: t.id, minutes: t.minutes, note: t.note } : null; })()");
check('今日有可编辑记录', Boolean(before), before);

if (before) {
  // 以「实际被点的那一行」为准：首页按 end 降序渲染，与 sessions 数组原始顺序不一致
  const clickedId = await evaluate("(() => { const row = document.querySelector('[data-session]'); if (!row) return null; const id = row.dataset.session; row.click(); return id; })()");
  await sleep(600);
  await shot('40-session-edit');
  const sheetOpen = await evaluate("!document.querySelector('#sheet').hidden");
  check('记录编辑弹层打开', sheetOpen, { sheetOpen, clickedId });

  await evaluate(`(() => {
    document.querySelector('#r-title').value = '改过的标题';
    document.querySelector('#r-minutes').value = '77';
    document.querySelector('#r-note').value = '改过的备注';
    document.querySelector('#sheet [data-act="save"]').click();
    return true;
  })()`);
  await sleep(700);
  const afterEdit = await evaluate("(() => { const s = JSON.parse(localStorage.getItem('study-tracker/v1')); const t = s.sessions.find(x => x.id === '" + clickedId + "'); return { title: t && t.title, minutes: t && t.minutes, note: t && t.note, sheetHidden: document.querySelector('#sheet').hidden }; })()");
  check('记录编辑已保存', afterEdit.title === '改过的标题' && afterEdit.minutes === 77 && afterEdit.note === '改过的备注' && afterEdit.sheetHidden, afterEdit);

  // 删除同一条（按 id 点开，避免点到别的行）
  await evaluate("(() => { const row = [...document.querySelectorAll('[data-session]')].find((r) => r.dataset.session === '" + clickedId + "'); if (row) row.click(); })()"); await sleep(600);
  await evaluate("document.querySelector('[data-act=\"delete\"]').click()"); await sleep(600);
  await shot('41-session-delete-confirm');
  await evaluate("document.querySelector('[data-act=\"yes\"]').click()"); await sleep(800);
  const afterDel = await evaluate("(() => { const s = JSON.parse(localStorage.getItem('study-tracker/v1')); return { exists: s.sessions.some(x => x.id === '" + clickedId + "'), count: s.sessions.length }; })()");
  check('记录删除生效', afterDel.exists === false, afterDel);
}

check('无异常', logs.length === 0, logs.slice(0,3));
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result3.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results,null,2));
console.log(`[test3] ${results.length - failed.length}/${results.length} 通过`);
ws.close(); edge.kill(); process.exit(failed.length ? 1 : 0);
