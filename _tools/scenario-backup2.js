(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const out={};
  try {
    location.hash='#/me'; await sleep(1500);
    out.autoSub = (document.querySelector('#backup-sub') || {}).innerText || '';
    out.restoreSub = (document.querySelector('#restore-sub') || {}).innerText || '';
    document.querySelector('[data-act="autobackup"]').click(); await sleep(1000);
    out.toggleToast = (document.querySelector('#toast') || {}).innerText || '';
    out.autoSubAfterToggle = (document.querySelector('#backup-sub') || {}).innerText || '';
    document.querySelector('[data-act="autobackup"]').click(); await sleep(1000);
    out.autoSubRestored = (document.querySelector('#backup-sub') || {}).innerText || '';
    document.querySelector('[data-act="backup-now"]').click(); await sleep(1400);
    out.backupToast = (document.querySelector('#toast') || {}).innerText || '';
    out.restoreSubAfterBackup = (document.querySelector('#restore-sub') || {}).innerText || '';
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()