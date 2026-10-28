(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    out.hashBefore = location.hash;
    out.title = document.title;
    location.hash='#/stats'; await sleep(1400);
    out.hashAfter = location.hash;
    out.viewLen = document.querySelector('#view') ? document.querySelector('#view').innerText.length : -1;
    out.head = document.querySelector('#view').innerText.replace(/\s+/g,' ').slice(0,160);
    const gen = document.querySelector('#view [data-act="report-poster"]');
    out.hasGen = !!gen;
  } catch (e) { out.error = String(e && e.stack || e); }
  return out;
})()