(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  const save = q('#sheet [data-act="save"]');
  out.hasSave = !!save;
  if (save) { save.click(); await sleep(1200); }
  out.sheetGone = !q('#sheet') || q('#sheet').hidden;
  out.toast = (q('#toast') && q('#toast').innerText) || 'no-toast';
  location.hash='#/home'; await sleep(900);
  out.hero = q('#view .hero') ? q('#view .hero').innerText.replace(/\s+/g,' ').slice(0,120) : 'NO-HERO';
  out.stats = [...document.querySelectorAll('#view .stat')].map(e=>e.innerText.replace(/\s+/g,' '));
  return out;
})()