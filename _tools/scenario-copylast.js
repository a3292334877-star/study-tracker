(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const t = document.querySelector('#r-title');
    if (t) { t.value=''; t.dispatchEvent(new Event('input', {bubbles:true})); }
    const n = document.querySelector('#r-note');
    if (n) { n.value=''; n.dispatchEvent(new Event('input', {bubbles:true})); }
    const m = document.querySelector('#r-minutes');
    if (m) { m.value=''; m.dispatchEvent(new Event('input', {bubbles:true})); }
    const btn = document.querySelector('#r-copy-last');
    out.hasBtn = !!btn;
    btn.click(); await sleep(900);
    out.toast = (document.querySelector('#toast') || {}).innerText || '';
    out.values = {
      title: (document.querySelector('#r-title')||{}).value,
      minutes: (document.querySelector('#r-minutes')||{}).value,
      note: (document.querySelector('#r-note')||{}).value,
      activeSubject: (document.querySelector('#sheet .chip.on, #sheet .chip.active') || {}).innerText || '',
    };
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()