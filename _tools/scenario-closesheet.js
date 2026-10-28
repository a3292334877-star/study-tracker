(async () => {
  const U = await import('./js/util.js');
  U.closeSheet();
  location.hash = '#/log';
  setTimeout(() => window.scrollTo(0, 0), 100);
  return 'closed';
})()