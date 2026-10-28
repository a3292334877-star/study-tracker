(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  if (location.hash !== '#/timer') { location.hash='#/timer'; await sleep(900); }
  out.ready = !!q('#btn-main');
  q('#btn-main').click(); await sleep(1600);
  out.stateRunning = q('#ring-state').innerText;
  out.notifWhileRunning = window.AndroidApp.updateTimerNotification('专注 · 00:01 · 计时中', true);
  await sleep(500);
  try { window.AndroidApp.stopTimerNotification(); out.stop = 'ok'; } catch (e) { out.stop = 'err:' + e.message; }
  await sleep(700);
  return out;
})()