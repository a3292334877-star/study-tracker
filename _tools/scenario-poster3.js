(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    location.hash='#/stats'; await sleep(1500);
    const gen = document.querySelector('#view [data-act="report-poster"]');
    if (!gen) return { err: 'no gen button' };
    gen.click(); await sleep(1800);
    const c = document.querySelector('#report-canvas');
    if (!c) return { err: 'no canvas', sheet: !!document.querySelector('#sheet'), sheetText: document.querySelector('#sheet') ? document.querySelector('#sheet').innerText.slice(0,120) : '' };
    out.canvas = { w: c.width, h: c.height };
    const url = c.toDataURL('image/png');
    out.url = url;
    out.len = url.length;
    out.sheetText = document.querySelector('#sheet').innerText.replace(/\s+/g,' ').slice(0,120);
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()