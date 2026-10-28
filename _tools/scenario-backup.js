(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    const closeBtn = document.querySelector('#sheet [data-act="cancel"]');
    if (closeBtn && !document.querySelector('#sheet').hidden) { closeBtn.click(); await sleep(600); }
    /* 清理刚才测试插入的那条记录 */
    const store = await import('/js/store.js');
    const st = store.getState();
    const fake = st.sessions.find(s => s.title === '听力精听练习');
    if (fake) { store.removeSession(fake.id); out.removedFake = true; }
    location.hash='#/me'; await sleep(1400);
    out.notifyRow = (document.querySelector('[data-act="notify"]') || {}).innerText || '';
    out.autoSub = (document.querySelector('#backup-sub') || {}).innerText || '';
    out.restoreSub = (document.querySelector('#restore-sub') || {}).innerText || '';
    document.querySelector('[data-act="backup-now"]').click(); await sleep(1200);
    out.toast = (document.querySelector('#toast') || {}).innerText || '';
    out.autoSubAfter = (document.querySelector('#backup-sub') || {}).innerText || '';
    out.restoreSubAfter = (document.querySelector('#restore-sub') || {}).innerText || '';
    const raw = localStorage.getItem('study-tracker/backup-latest');
    out.backup = raw ? { len: raw.length, reason: JSON.parse(raw).reason, at: JSON.parse(raw).backupDate } : 'none';
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()