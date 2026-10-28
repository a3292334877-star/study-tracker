/* 通用工具函数 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* 搜索关键词高亮：先转义再加 <mark>，不会引入 HTML */
export function highlight(text, q) {
  const safe = esc(text);
  const kw = String(q || '').trim();
  if (!kw) return safe;
  const needle = esc(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(new RegExp(needle, 'gi'), (m) => `<mark class="hl">${m}</mark>`);
  } catch (_) {
    return safe;
  }
}

/* ---------- 日期 ---------- */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d = new Date(), weekStart = 1) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() - weekStart + 7) % 7;
  return addDays(x, -diff);
}
export function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
export function weekdayCN(d, prefix = '周') {
  return prefix + WEEK_CN[d.getDay()];
}
export function monthDayCN(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
export function relativeDay(d) {
  const t = dateKey(new Date());
  const k = dateKey(d);
  if (k === t) return '今天';
  if (k === dateKey(addDays(new Date(), -1))) return '昨天';
  return monthDayCN(d);
}

/* ---------- 数字 / 时间格式 ---------- */
export function fmtMin(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return { value: m, unit: '分钟', text: `${m} 分钟` };
  const h = Math.floor(m / 60);
  const r = m % 60;
  return {
    value: h,
    unit: r ? `小时${r}分` : '小时',
    text: r ? `${h} 小时 ${r} 分` : `${h} 小时`,
  };
}
export function fmtMinShort(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${r}m` : `${h}h`;
}
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function hhmm(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return '夜深了';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 23) return '晚上好';
  return '夜深了';
}

/* ---------- 主题 ---------- */
export function applyTheme(pref) {
  const dark = pref === 'dark' ||
    (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0f15' : '#f4f6fb');
  // Android 壳里同步状态栏/导航栏颜色
  try { if (window.AndroidApp && window.AndroidApp.setTheme) window.AndroidApp.setTheme(dark); } catch (_) {}
}

/* ---------- toast ---------- */
let toastTimer = 0;
export function toast(msg, ms = 1900) {
  const box = $('#toast');
  if (!box) return;
  // 无障碍：toast 作为礼貌级 live region，读屏会念出提示
  if (!box.getAttribute('role')) box.setAttribute('role', 'status');
  if (!box.getAttribute('aria-live')) box.setAttribute('aria-live', 'polite');
  box.textContent = msg;
  box.hidden = false;
  requestAnimationFrame(() => box.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => { box.hidden = true; }, 240);
  }, ms);
}

/* ---------- 底部弹层 ---------- */
let sheetCloser = null;
let sheetHideTimer = 0;
let sheetLastFocus = null;
let sheetTrap = null;

/* 弹层内可聚焦元素（用 getClientRects 判断可见，兼容 position:fixed） */
function sheetFocusables(root) {
  return $$(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    root,
  ).filter((el) => !el.disabled && el.getClientRects().length > 0);
}

export function openSheet(html, onMount) {
  const sheet = $('#sheet');
  const backdrop = $('#sheet-backdrop');
  if (!sheet || !backdrop) return;
  clearTimeout(sheetHideTimer);   // 取消上一次 closeSheet 的延迟隐藏，支持弹层原地替换
  if (!sheetCloser) sheetLastFocus = document.activeElement;
  sheet.innerHTML = `<div class="sheet-handle"></div>${html}`;
  sheet.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('show');
    backdrop.classList.add('show');
  });
  // 无障碍：声明为模态对话框，标题作为可读名称
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const titleEl = sheet.querySelector('.sheet-title, h2, h3');
  const titleText = titleEl ? titleEl.textContent.trim() : '';
  if (titleText) sheet.setAttribute('aria-label', titleText);
  else sheet.removeAttribute('aria-label');
  if (typeof onMount === 'function') onMount(sheet);
  sheetCloser = closeSheet;
  // 焦点陷阱：Tab 在弹层内循环，Esc 关闭
  if (sheetTrap) document.removeEventListener('keydown', sheetTrap, true);
  sheetTrap = (e) => {
    if (!isSheetOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const list = sheetFocusables(sheet);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!sheet.contains(active)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', sheetTrap, true);
  setTimeout(() => {
    if (!isSheetOpen()) return;
    if (sheet.contains(document.activeElement)) return;
    const first = sheetFocusables(sheet)[0];
    if (first) first.focus({ preventScroll: true });
  }, 60);
}
export function closeSheet() {
  const sheet = $('#sheet');
  const backdrop = $('#sheet-backdrop');
  if (!sheet || !backdrop) return;
  sheet.classList.remove('show');
  backdrop.classList.remove('show');
  clearTimeout(sheetHideTimer);
  sheetHideTimer = setTimeout(() => {
    sheet.hidden = true;
    backdrop.hidden = true;
    sheet.innerHTML = '';
  }, 300);
  sheetCloser = null;
  if (sheetTrap) { document.removeEventListener('keydown', sheetTrap, true); sheetTrap = null; }
  const back = sheetLastFocus;
  sheetLastFocus = null;
  if (back && back.isConnected && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch (_) {}
  }
}
export function isSheetOpen() {
  return Boolean(sheetCloser);
}

/* ---------- 确认弹层（替代原生 confirm，风格统一） ---------- */
export function confirmSheet({ title = '确认', desc = '', okText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    openSheet(`
      <h2 class="sheet-title">${esc(title)}</h2>
      ${desc ? `<p class="sheet-desc">${esc(desc)}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="no">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger-solid' : 'primary'}" type="button" data-act="yes">${esc(okText)}</button>
      </div>
    `, (sheet) => {
      let done = false;
      const finish = (val) => { if (done) return; done = true; closeSheet(); resolve(val); };
      sheet.querySelector('[data-act="no"]').addEventListener('click', () => finish(false));
      sheet.querySelector('[data-act="yes"]').addEventListener('click', () => finish(true));
      const backdrop = $('#sheet-backdrop');
      backdrop.addEventListener('click', () => finish(false), { once: true });
      // 弹层内容被别处替换掉时，按取消处理，避免 Promise 永远不 resolve
      const mo = new MutationObserver(() => {
        if (!sheet.isConnected || !document.body.contains(sheet)) return;
        if (!sheet.querySelector('[data-act="yes"]')) { mo.disconnect(); if (!done) { done = true; resolve(false); } }
      });
      mo.observe(sheet, { childList: true });
    });
  });
}

/* ---------- 输入弹层（替代原生 prompt） ---------- */
export function promptSheet({ title = '输入', desc = '', placeholder = '', value = '', okText = '确定', maxlength = 40 } = {}) {
  return new Promise((resolve) => {
    openSheet(`
      <h2 class="sheet-title">${esc(title)}</h2>
      ${desc ? `<p class="sheet-desc">${esc(desc)}</p>` : ''}
      <div class="field">
        <input class="input" id="prompt-input" maxlength="${maxlength}" placeholder="${esc(placeholder)}" value="${esc(value)}" />
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="no">取消</button>
        <button class="btn primary" type="button" data-act="yes">${esc(okText)}</button>
      </div>
    `, (sheet) => {
      let done = false;
      const input = sheet.querySelector('#prompt-input');
      const finish = (val) => { if (done) return; done = true; closeSheet(); resolve(val); };
      sheet.querySelector('[data-act="no"]').addEventListener('click', () => finish(null));
      sheet.querySelector('[data-act="yes"]').addEventListener('click', () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        finish(v);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sheet.querySelector('[data-act="yes"]').click(); }
      });
      setTimeout(() => input.focus(), 150);
    });
  });
}

/* ---------- 轻触反馈 ---------- */
export function haptic() {
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
}
