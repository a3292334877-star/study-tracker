(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    window.focus();
    await sleep(300);
    out.focused = document.hasFocus();
    try { out.clip = (await navigator.clipboard.readText()).slice(0, 260); } catch (e) { out.clipErr = String(e); }
    location.hash='#/log'; await sleep(1200);
    out.logActs = [...document.querySelectorAll('#view [data-act]')].map(b=>b.dataset.act).slice(0,10);
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()