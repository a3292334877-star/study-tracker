(async function(){
  const out = {};
  try {
    const store = await import('/js/store.js');
    const st = store.getState();
    const bad = st.sessions.filter(s => !s.title || s.title === '未填写学习内容');
    out.before = st.sessions.length;
    out.bad = bad.map(b => ({ id: b.id, minutes: b.minutes, date: b.date }));
    for (const b of bad) store.removeSession(b.id);
    out.after = store.getState().sessions.length;
  } catch (e) { out.error = String((e && e.stack) || e); }
  return out;
})()