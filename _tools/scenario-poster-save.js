(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  const btns = [...document.querySelectorAll('#sheet button')].map(b=>({t:b.innerText.trim(), a:b.dataset.act}));
  out.btns = btns;
  const save = [...document.querySelectorAll('#sheet button')].find(b => b.innerText.includes('保存'));
  save.click(); await sleep(1500);
  out.toast = (q('#toast') && q('#toast').innerText) || 'no-toast';
  return out;
})()