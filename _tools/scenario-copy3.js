(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const closeBtn = document.querySelector('#sheet [data-act="cancel"]');
    if (closeBtn && !document.querySelector('#sheet').hidden) { closeBtn.click(); await sleep(600); }
    location.hash='#/stats'; await sleep(1400);
    const btn = document.querySelector('#view [data-act="report-text"]');
    if (!btn) return { err: 'no text btn' };
    btn.click(); await sleep(1000);
    out.toast = (document.querySelector('#toast') || {}).innerText || '';
    const plus = document.querySelector('#tabbar .tab-primary');
    plus.click(); await sleep(1200);
    const t = document.querySelector('#r-title');
    out.titleExists = !!t;
    if (t) { t.focus(); t.click(); out.focusedId = document.activeElement ? document.activeElement.id : ''; }
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()