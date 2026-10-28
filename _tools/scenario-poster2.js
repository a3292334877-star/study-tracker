(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  location.hash='#/stats'; await sleep(1200);
  const gen = q('#view [data-act="report-poster"]');
  if (!gen) return {err:'no poster button'};
  gen.click(); await sleep(1500);
  const canvas = q('#report-canvas');
  out.canvas = canvas ? {w:canvas.width,h:canvas.height} : null;
  const saveBtn = q('#sheet [data-act="save-img"]');
  if (!saveBtn) return {...out, err:'no save btn'};
  out.hasBridge = !!(window.AndroidApp && window.AndroidApp.saveImage);
  saveBtn.click(); await sleep(2500);
  out.toast = (q('#toast') && q('#toast').innerText) || 'no-toast';
  out.sheetOpen = !!q('#sheet') && !q('#sheet').hidden;
  return out;
})()