(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const store = await import('/js/store.js');
    const st = store.getState();
    out.sessions = st.sessions.length;
    out.subjects = st.subjects.length;
    out.hash = location.hash;
    out.toast = (document.querySelector('#toast') || {}).innerText || '';
    out.autoSub = (document.querySelector('#backup-sub') || {}).innerText || '';
    out.restoreSub = (document.querySelector('#restore-sub') || {}).innerText || '';
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()