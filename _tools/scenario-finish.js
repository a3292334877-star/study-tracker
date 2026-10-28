(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  location.hash='#/timer'; await sleep(900);
  out.hash = location.hash;
  out.time = q('#ring-time') ? q('#ring-time').innerText : null;
  out.state = q('#ring-state') ? q('#ring-state').innerText : null;
  q('#btn-reset').click(); await sleep(700);
  out.confirm = q('#sheet') ? q('#sheet').innerText.replace(/\s+/g,' ').slice(0,140) : 'NO-SHEET';
  const yes = q('#sheet [data-act="yes"]');
  if (yes) { yes.click(); await sleep(1200); }
  out.afterSheet = q('#sheet') ? q('#sheet').innerText.replace(/\s+/g,' ').slice(0,200) : 'sheet-closed';
  out.timeAfter = q('#ring-time') ? q('#ring-time').innerText : null;
  return out;
})()