(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  location.hash='#/timer'; await sleep(800);
  out.time0 = q('#ring-time').innerText;
  q('#btn-main').click();
  await sleep(2500);
  out.time1 = q('#ring-time').innerText;
  out.state = q('#ring-state').innerText;
  out.btn = q('#btn-main').innerText;
  return out;
})()