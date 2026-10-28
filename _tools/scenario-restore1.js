(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    document.querySelector('[data-act="restore"]').click(); await sleep(900);
    const sheet = document.querySelector('#sheet');
    out.sheetText = sheet ? sheet.innerText.replace(/\s+/g,' ').slice(0,200) : 'no-sheet';
    const yes = sheet ? [...sheet.querySelectorAll('button')].find(b => /恢复/.test(b.innerText)) : null;
    out.hasYes = !!yes;
    if (yes) { yes.click(); out.clicked = true; }
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()