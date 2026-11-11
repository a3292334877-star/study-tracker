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
/* ================= v1.11：CSV 导入 ================= */

/**
 * 解析 CSV 文本成二维数组（RFC4180 子集）：支持双引号包裹、"" 转义、字段内换行、
 * CRLF/CR/LF 三种换行、开头 BOM。空行会被丢弃。
 */
export function parseCSV(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length && !(r.length === 1 && String(r[0]).trim() === ''));
}

const CSV_HEAD = ['科目', '标题', '标签', '分钟', '日期', '开始时间', '结束时间', '备注'];

/** 'YYYY-MM-DD' + 'HH:mm' → 时间戳；解析不了返回 0 */
function csvTs(dateStr, hm) {
  const d = String(dateStr || '').trim();
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(d);
  if (!m) return 0;
  let hh = 0; let mm = 0;
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (t) { hh = Number(t[1]); mm = Number(t[2]); }
  if (hh > 23 || mm > 59) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm, 0, 0).getTime();
}

/**
 * CSV 文本 → 记录草稿。返回 { records, skipped }：
 *   records: [{ subjectName, title, tags[], minutes, note, start, end }]
 *   skipped: [{ line, reason }]（line 为文件里的行号，从 2 起算表头之后）
 * 表头按列名识别（顺序可变）；没有可识别表头时按导出列顺序。
 */
export function csvToRecords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { records: [], skipped: [] };
  const norm = (v) => String(v ?? '').trim();
  const head = rows[0].map(norm);
  const hasHead = head.some((h) => h === '标题' || h === '科目' || h === '分钟');
  const idx = {};
  if (hasHead) {
    CSV_HEAD.forEach((name) => { const i = head.indexOf(name); if (i >= 0) idx[name] = i; });
  } else {
    CSV_HEAD.forEach((name, i) => { if (i < head.length) idx[name] = i; });
  }
  const body = hasHead ? rows.slice(1) : rows;
  const records = [];
  const skipped = [];
  body.forEach((cells, n) => {
    const line = n + (hasHead ? 2 : 1);
    const get = (name) => (idx[name] === undefined ? '' : norm(cells[idx[name]]));
    const title = get('标题').slice(0, 40);
    if (!title) { skipped.push({ line, reason: '标题为空' }); return; }
    const minutes = Math.max(0, Math.round(Number(get('分钟')) || 0));
    const subjectName = get('科目').slice(0, 20);
    const dateStr = get('日期');
    const t0 = get('开始时间');
    const t1 = get('结束时间');
    let end = csvTs(dateStr, t1) || csvTs(dateStr, t0);
    if (!dateStr) { skipped.push({ line, reason: '日期为空' }); return; }
    if (!end) { skipped.push({ line, reason: '日期看不懂' }); return; }
    const start = csvTs(dateStr, t0) || (end - minutes * 60000);
    const tags = String(get('标签') || '').split(/[,，、\s]+/).filter(Boolean);
    records.push({
      subjectName,
      title,
      tags,
      minutes,
      note: get('备注').slice(0, 500),
      start: Math.min(start, end),
      end,
    });
  });
  return { records, skipped };
}
