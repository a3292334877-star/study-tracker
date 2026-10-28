(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  location.hash='#/subjects'; await sleep(800);
  out.sheetId = !!q('#sheet');
  const row = q('[data-subject]');
  out.rows = document.querySelectorAll('[data-subject]').length;
  row.click(); await sleep(500);
  out.detail = q('#sheet') ? q('#sheet').innerText.replace(/\s+/g,' ').slice(0,120) : 'NO-SHEET';
  const edit = q('#sheet [data-act="edit"]');
  out.hasEdit = !!edit;
  edit.click(); await sleep(450);
  out.editorText = q('#sheet').innerText.replace(/\s+/g,' ').slice(0,160);
  out.hasGoalInput = !!q('#sub-goal');
  out.hasArchiveBtn = !!q('#sheet [data-act="archive"]');
  q('#sub-goal').value = '3';
  q('#sheet [data-act="save"]').click();
  await sleep(900);
  out.afterSave = q('#view').innerText.replace(/\s+/g,' ').slice(0,260);
  return out;
})()