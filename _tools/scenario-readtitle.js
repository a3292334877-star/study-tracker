(async function(){
  const t = document.querySelector('#r-title');
  return { value: t ? t.value : 'missing' };
})()