(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  q('#btn-main').click(); // 暂停
  await sleep(1600);
  return { state: q('#ring-state').innerText, btn: q('#btn-main').innerText, time: q('#ring-time').innerText };
})()