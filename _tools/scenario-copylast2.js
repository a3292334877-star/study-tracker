(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const closeBtn = document.querySelector('#sheet [data-act="cancel"]');
    if (closeBtn && !document.querySelector('#sheet').hidden) { closeBtn.click(); await sleep(600); }
    const store = await import('/js/store.js');
    const subs = store.getState().subjects;
    const target = subs.find(s => s.name.includes('英语')) || subs[0];
    store.addSession({ subjectId: target.id, title: '听力精听练习', minutes: 33, note: '第 3 段没跟上', end: Date.now() });
    out.added = { subject: target.name };
    await sleep(400);
    document.querySelector('#tabbar .tab-primary').click(); await sleep(1300);
    out.prevLine = (document.querySelector('#sheet') || {}).innerText.split('\n').slice(0,4).join(' | ');
    document.querySelector('#r-copy-last').click(); await sleep(900);
    out.toast = (document.querySelector('#toast') || {}).innerText || '';
    out.values = {
      title: (document.querySelector('#r-title')||{}).value,
      minutes: (document.querySelector('#r-minutes')||{}).value,
      note: (document.querySelector('#r-note')||{}).value,
      activeSubject: (document.querySelector('#sheet .chip.on, #sheet .chip.active') || {}).innerText || '',
    };
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()