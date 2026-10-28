import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const ROOT = process.argv[2], OUT = process.argv[3], EDGE = process.argv[4];
const PORT = Number(process.env.ST_PORT || 8123), DBG = Number(process.env.ST_DBG || 9339);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => { http.get(u, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej); });
const userDir = path.join(OUT, '_profile7');
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

await send('Page.navigate',{url:URL+'#/stats?range=week'}); await sleep(1500);

// 1. 柱状图可点击
const colCount = await evaluate("document.querySelectorAll('button.chart-col').length");
check('趋势柱是可点击按钮', colCount === 7, { colCount });

// 确保今天有记录
await evaluate(`(async()=>{
  const m = await import('./js/store.js');
  const st = m.getState();
  if (!st.subjects.length) m.addSubject({ name:'测试科目', emoji:'📘', color:'#4f6df5' });
  const sid = m.getState().subjects[0].id;
  if (!m.sessionsOfDay().length) m.addSession({ subjectId: sid, start: Date.now()-1800000, end: Date.now(), minutes: 30, note: '' });
  return true;
})()`, true);
await evaluate("location.hash='#/timer'; setTimeout(()=>{location.hash='#/stats?range=week';},60)"); await sleep(1200);

// 2. 点一个最近有记录的柱子（选今天）
await evaluate(`(() => {
  const d = new Date();
  const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const col = document.querySelector('button.chart-col[data-day="' + key + '"]');
  (col || document.querySelectorAll('button.chart-col')[0]).click();
  return true;
})()`);
await sleep(700);
const daySheet = await evaluate(`(() => ({
  open: !document.querySelector('#sheet').hidden,
  title: document.querySelector('#sheet .sheet-title')?.textContent,
  desc: document.querySelector('#sheet .sheet-desc')?.textContent,
  rows: document.querySelectorAll('#day-list [data-session]').length,
}))()`);
check('点击趋势柱打开当天记录', daySheet.open && daySheet.rows >= 1, daySheet);
await shot('50-day-sheet');

// 3. 热力图可点击
await evaluate("document.querySelector('#sheet-backdrop').click()"); await sleep(500);
const heatBtns = await evaluate("document.querySelectorAll('.heatmap button').length");
check('热力图 56 格且可点击', heatBtns === 56, { heatBtns });

await evaluate(`(() => {
  const btns = [...document.querySelectorAll('.heatmap button')].filter(b => !b.disabled);
  btns[btns.length - 1].click();
  return true;
})()`);
await sleep(700);
const heatSheet = await evaluate(`(() => ({
  open: !document.querySelector('#sheet').hidden,
  title: document.querySelector('#sheet .sheet-title')?.textContent,
}))()`);
check('点击热力图格子打开当天', heatSheet.open, heatSheet);

// 4. 从当天弹层补记一条
const beforeCount = await evaluate("JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length");
await evaluate("document.querySelector('#sheet [data-act=\"add\"]').click()"); await sleep(600);
await evaluate(`(() => {
  document.querySelector('#r-title').value = '补记测试';
  document.querySelector('#r-minutes').value = '20';
  document.querySelector('#r-note').value = '补记的笔记';
  document.querySelector('#sheet [data-act="save"]').click();
  return true;
})()`);
await sleep(800);
const afterCount = await evaluate("JSON.parse(localStorage.getItem('study-tracker/v1')).sessions.length");
check('补记成功落库', afterCount === beforeCount + 1, { beforeCount, afterCount });

// 5. 补记后首页出现
await evaluate("location.hash='#/timer'; setTimeout(()=>{location.hash='#/home';},60)"); await sleep(1200);
const homeHas = await evaluate("document.body.innerText.includes('补记测试')");
check('补记出现在今日记录', homeHas, { homeHas });
await shot('51-home-after-manual');

// 6. 首页「+ 补记」按钮存在且可用
await evaluate("document.querySelector('[data-add-record]').click()"); await sleep(600);
const addSheet = await evaluate("!document.querySelector('#sheet').hidden && !!document.querySelector('#r-minutes')");
check('首页补记入口可用', addSheet, { addSheet });
await evaluate("document.querySelector('#sheet [data-act=\"cancel\"]').click()"); await sleep(400);

// 7. 科目详情
await evaluate("location.hash='#/subjects'"); await sleep(1000);
await shot('52-subjects');
const subjRows = await evaluate("document.querySelectorAll('[data-subject]').length");
check('科目列表有条目', subjRows >= 1, { subjRows });

await evaluate("document.querySelector('[data-subject]').click()"); await sleep(700);
const detail = await evaluate(`(() => ({
  open: !document.querySelector('#sheet').hidden,
  title: document.querySelector('#sheet .sheet-title')?.textContent,
  stats: document.querySelectorAll('#sheet .stat').length,
  recent: document.querySelectorAll('#sheet [data-session]').length,
  hasEdit: !!document.querySelector('#sheet [data-act="edit"]'),
}))()`);
check('科目详情弹层', detail.open && detail.stats === 3 && detail.hasEdit, detail);
await shot('53-subject-detail');

// 从详情打开一条记录编辑，再返回
await evaluate("document.querySelector('#sheet [data-session]').click()"); await sleep(700);
const editorOpen = await evaluate("!!document.querySelector('#sheet #r-title')");
check('详情里可打开记录编辑', editorOpen, { editorOpen });
await shot('54-detail-to-editor');
await evaluate("document.querySelector('#sheet [data-act=\"save\"]').click()"); await sleep(700);
const backToDetail = await evaluate("!!document.querySelector('#sheet .stat')");
check('保存后回到科目详情', backToDetail, { backToDetail });

check('无异常', logs.length === 0, logs.slice(0,3));
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, 'result4.json'), JSON.stringify({ results, logs }, null, 2));
console.log(JSON.stringify(results,null,2));
console.log(`[test4] ${results.length - failed.length}/${results.length} 通过`);
ws.close(); edge.kill(); process.exit(failed.length ? 1 : 0);