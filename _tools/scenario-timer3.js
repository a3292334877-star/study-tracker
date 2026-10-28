(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  q('#btn-reset').click(); await sleep(700);
  out.sheet = q('#sheet') ? q('#sheet').innerText.replace(/\s+/g,' ').slice(0,220) : 'NO-SHEET';
  // 确认结束
  const yes = q('#sheet [data-act="yes"]') || q('#sheet [data-act="ok"]');
  if (yes) { out.confirmLabel = yes.innerText.trim(); yes.click(); await sleep(900); }
  out.after = q('#view').innerText.replace(/\s+/g,' ').slice(0,140);
  out.time = q('#ring-time') ? q('#ring-time').innerText : null;
  return out;
})()