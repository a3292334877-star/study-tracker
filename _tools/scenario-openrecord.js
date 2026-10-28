(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const plus = document.querySelector('#tabbar [data-route="timer"]') || document.querySelector('#tabbar .tab-primary');
    out.hasPlus = !!plus;
    if (plus) { plus.click(); await sleep(1200); }
    out.hash = location.hash;
    const sheet = document.querySelector('#sheet');
    out.sheetOpen = !!sheet && !sheet.hidden;
    out.text = sheet ? sheet.innerText.replace(/\s+/g,' ').slice(0,200) : '';
    out.fields = sheet ? [...sheet.querySelectorAll('input,textarea')].map(e=>({id:e.id, tag:e.tagName, ph:e.placeholder})) : [];
    out.copyBtn = !!document.querySelector('#r-copy-last');
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()