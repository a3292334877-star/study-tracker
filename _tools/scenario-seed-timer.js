(function(){
  const s = JSON.parse(localStorage.getItem('study-tracker/v1'));
  const sid = (s.subjects.find(x=>!x.archived)||{}).id || null;
  const t = { mode:'focus', style:'up', status:'paused', targetMs:1500000, accumulatedMs:95000, startedAt:0, subjectId:sid, startedAtWall: Date.now()-95000, sessionId:'probe-x1', targetReached:false };
  localStorage.setItem('study-tracker/timer', JSON.stringify(t));
  location.hash = '#/timer';
  location.reload();
  return 'seeded';
})()