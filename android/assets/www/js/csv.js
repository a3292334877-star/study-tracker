/* csv.js — v1.7 学习记录 CSV 导出（纯函数 + 浏览器下载辅助，无依赖） */

/**
 * 把记录数组转成 CSV 字符串（Excel 友好：BOM + CRLF）。
 * 列：科目,标题,标签,分钟,日期,开始时间,结束时间,备注
 * 日期/开始/结束用本地时间（记录里存的是 session.start / session.end 毫秒时间戳）。
 */
export function sessionsToCSV(sessions) {
  const escCell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const p2 = (n) => String(n).padStart(2, '0');
  const head = ['科目', '标题', '标签', '分钟', '日期', '开始时间', '结束时间', '备注'];
  const lines = [head.join(',')];
  for (const s of sessions) {
    const start = s.start ? new Date(s.start) : null;
    const end = s.end ? new Date(s.end) : null;
    const date = start ? `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())}` : '';
    const t0 = start ? `${p2(start.getHours())}:${p2(start.getMinutes())}` : '';
    const t1 = end ? `${p2(end.getHours())}:${p2(end.getMinutes())}` : '';
    lines.push([
      escCell(s.subjectName || ''),
      escCell(s.title || ''),
      escCell((s.tags || []).join(' ')),
      escCell(s.minutes || 0),
      escCell(date),
      escCell(t0),
      escCell(t1),
      escCell(s.note || ''),
    ].join(','));
  }
  // BOM：Excel 打开 UTF-8 中文不乱码；CRLF：记事本/Excel 换行正常
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

/** 导出文件名：study-records-20260128.csv */
export function csvFilename(prefix = 'study-records') {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.csv`;
}

/** 浏览器端下载（Android 壳里走 AndroidApp.saveFile，不走这里） */
export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
