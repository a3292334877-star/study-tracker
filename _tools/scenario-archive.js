(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  location.hash='#/subjects'; await sleep(800);
  const rows=[...document.querySelectorAll('[data-subject]')];
  out.before = rows.map(r=>r.querySelector('.row-title').innerText.trim());
  const target = rows.find(r=>r.innerText.includes('英语')) || rows[1];
  out.archiving = target.querySelector('.row-title').innerText.trim();
  target.click(); await sleep(400);
  q('#sheet [data-act="edit"]').click(); await sleep(400);
  q('#sheet [data-act="archive"]').click(); await sleep(500);
  out.confirmText = q('#sheet').innerText.replace(/\s+/g,' ').slice(0,150);
  q('#sheet [data-act="yes"]').click(); await sleep(900);
  out.afterText = q('#view').innerText.replace(/\s+/g,' ').slice(0,300);
  out.archivedSection = !!q('#view section.flat');
  // 恢复
  const archRow = q('#view section.flat [data-subject]');
  if (archRow) {
    archRow.click(); await sleep(400);
    q('#sheet [data-act="edit"]').click(); await sleep(400);
    out.restoreBtnLabel = q('#sheet [data-act="archive"]').innerText.trim();
    q('#sheet [data-act="archive"]').click(); await sleep(450);
    q('#sheet [data-act="yes"]').click(); await sleep(900);
    out.afterRestore = q('#view').innerText.replace(/\s+/g,' ').slice(0,200);
  }
  return out;
})()