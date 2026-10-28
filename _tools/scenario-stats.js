(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  const back = q('#sheet-backdrop, #sheet [data-act="close"]');
  location.hash='#/stats'; await sleep(1000);
  out.text = q('#view').innerText.replace(/\s+/g,' ').slice(0,900);
  out.acts = [...document.querySelectorAll('#view [data-act]')].map(b=>b.dataset.act);
  return out;
})()