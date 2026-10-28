(async function(){
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const q=(s)=>document.querySelector(s);
  const out={};
  const btn = q('#view [data-act="report-poster"]');
  btn.click(); await sleep(1200);
  const c = q('#report-canvas');
  out.canvas = c ? { w: c.width, h: c.height } : null;
  out.sheetText = q('#sheet') ? q('#sheet').innerText.replace(/\s+/g,' ').slice(0,180) : 'NO-SHEET';
  if (c) {
    const url = c.toDataURL('image/png');
    out.dataUrlLen = url.length;
    out.nonBlank = (() => {
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let colors = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) colors.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
      return colors.size;
    })();
  }
  out.saveBtn = !!q('#sheet [data-act="save-img"]') || !!q('#sheet [data-act="save"]');
  return out;
})()