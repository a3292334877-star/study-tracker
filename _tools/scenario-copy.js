(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    location.hash='#/stats'; await sleep(1500);
    const btn = document.querySelector('#view [data-act="report-text"]');
    if (!btn) return { err: 'no text button' };
    btn.click(); await sleep(1200);
    out.toast = (document.querySelector('#toast') || {}).innerText || 'no-toast';
    try { out.clip = (await navigator.clipboard.readText()).slice(0, 220); } catch (e) { out.clipErr = String(e); }
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()