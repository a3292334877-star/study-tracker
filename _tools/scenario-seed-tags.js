(async () => {
  const S = await import('./js/store.js');
  const all = S.allSessions();
  if (all[0]) S.updateSession(all[0].id, { tags: ['错题', '第3章'] });
  if (all[1]) S.updateSession(all[1].id, { tags: ['作图'] });
  if (all[2]) S.updateSession(all[2].id, { tags: ['复述', '真题'] });
  if (!S.getTemplates().length) {
    const sub = S.getState().subjects[0];
    S.addTemplate({ subjectId: sub.id, title: '第三章 导数计算', minutes: 30, tags: ['真题'] });
    S.addTemplate({ subjectId: sub.id, title: '英语听力精听', minutes: 45, tags: ['听力'] });
  }
  return { tags: S.allTags(), tpls: S.getTemplates().length };
})()