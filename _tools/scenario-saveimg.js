(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const btn = document.querySelector('#sheet [data-act="save-img"]');
    if (!btn) return { err: 'no save button' };
    btn.click(); await sleep(2500);
    out.toast = (document.querySelector('#toast') || {}).innerText || 'no-toast';
    out.sheetOpen = !!document.querySelector('#sheet') && !document.querySelector('#sheet').hidden;
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()