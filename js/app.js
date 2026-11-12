/* 应用入口：路由 + 渲染 */
import { load, subscribe, getState, setSetting, getLoadNotice, STORAGE_ERROR_EVENT, STORAGE_RECOVERED_EVENT, minutesOfDay, streak } from './store.js';
import { applyTheme, isSheetOpen, closeSheet, toast, dateKey } from './util.js';
import { restore as restoreTimer } from './timer.js';

import { renderHome } from './views/home.js';
import { renderLog } from './views/log.js';
import { renderSubjects } from './views/subjects.js';
import { renderTimer } from './views/timer.js';
import { renderStats } from './views/stats.js';
import { renderReview } from './views/review.js';
import { renderAchievements } from './views/achievements.js';
import { renderCalendar } from './views/calendar.js';
import { renderPlan } from './views/plan.js';
import { renderMemory } from './views/memory.js';
import { renderGoals } from './views/goals.js';
import { renderMonthly } from './views/monthly.js';
import { renderMe } from './views/me.js';
import { openRecordSheet } from './sheets.js';

const ROUTES = {
  home: renderHome,
  log: renderLog,
  subjects: renderSubjects,
  timer: renderTimer,
  stats: renderStats,
  review: renderReview,
  achievements: renderAchievements,
  calendar: renderCalendar,
  plan: renderPlan,
  memory: renderMemory,
  goals: renderGoals,
  monthly: renderMonthly,
  me: renderMe,
};

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subEl = document.getElementById('page-sub');
const tabbar = document.getElementById('tabbar');

let currentCleanup = null;
let currentPage = null;      // 当前渲染出来的页面对象（可能带局部刷新 refresh()）
let currentRoute = '';

/* 同一个任务（一次点击/一次弹层回调）里只重建一次页面：
   store 订阅已经重绘过，视图随后再调 ctx.refresh() 就跳过（v1.5 去掉重复渲染） */
let didRenderThisTask = false;
function markRendered() {
  if (didRenderThisTask) return;
  didRenderThisTask = true;
  queueMicrotask(() => { didRenderThisTask = false; });
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, search] = raw.split('?');
  const query = {};
  new URLSearchParams(search || '').forEach((v, k) => { query[k] = v; });
  const name = ROUTES[path] ? path : 'home';
  return { name, query };
}

const ctx = {
  query: {},
  go(hash) { location.hash = hash; },
  refresh() { if (!didRenderThisTask) softRefresh(); },
  onLeave(fn) { currentCleanup = fn; },
};

/* 数据变化后的刷新：视图自己声明了 refresh() 就让视图局部更新（记录页据此
   保住筛选条件、已加载页数与滚动位置），否则整页重建并保持滚动位置 */
function softRefresh() {
  if (currentPage && typeof currentPage.refresh === 'function') {
    try {
      currentPage.refresh();
      markRendered();
      return;
    } catch (err) {
      console.error('[refresh]', err);
    }
  }
  render({ keepScroll: true });
}

function render({ keepScroll = false } = {}) {
  const { name, query } = parseHash();
  const scrollY = keepScroll ? window.scrollY : 0;
  ctx.query = query;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (err) { console.error(err); }
    currentCleanup = null;
  }

  const page = ROUTES[name](ctx);
  titleEl.textContent = page.title;
  subEl.textContent = page.sub || '';
  view.innerHTML = page.html;
  const registered = [];
  ctx.onLeave = (fn) => { if (typeof fn === 'function') registered.push(fn); };
  if (typeof page.mount === 'function') {
    try { page.mount(view); } catch (err) { console.error('[mount]', err); }
  }
  if (typeof page.cleanup === 'function') registered.push(page.cleanup);
  if (registered.length) currentCleanup = () => registered.forEach((fn) => fn());
  currentPage = page;
  currentRoute = name;
  markRendered();

  tabbar.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.route === name);
  });
  document.title = `${page.title} · 学习记录`;
  // 无障碍：路由切换时给读屏播报页面名
  const srStatus = document.getElementById('sr-status');
  if (srStatus) srStatus.textContent = `${page.title}${page.sub ? `，${page.sub}` : ''}`;
  if (keepScroll) window.scrollTo({ top: scrollY, behavior: 'auto' });
  else window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------- 初始化 ---------- */
/* v1.6：写盘失败不再是「静默丢失」，用常驻横幅告诉用户，并给一条去导出的路 */
function showStorageWarn() {
  const bar = document.getElementById('storage-warn');
  if (!bar) return;
  bar.hidden = false;
  const closeBtn = bar.querySelector('[data-close]');
  if (closeBtn) closeBtn.onclick = () => { bar.hidden = true; };
  const link = bar.querySelector('a[href^="#/me"]');
  if (link) link.onclick = () => { bar.hidden = true; };
}

function boot() {
  load();
  const notice = getLoadNotice();
  if (notice) toast(notice.message, notice.kind === 'read-error' ? 3200 : 5200);
  window.addEventListener(STORAGE_ERROR_EVENT, showStorageWarn);
  // 写入恢复正常后自己收起提示条，别让用户以为还在丢数据
  window.addEventListener(STORAGE_RECOVERED_EVENT, () => {
    const bar = document.getElementById('storage-warn');
    if (bar) bar.hidden = true;
  });
  applyTheme(getState().settings.theme);

  // 跟随系统主题
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => {
    if (getState().settings.theme === 'auto') applyTheme('auto');
  });

  restoreTimer();

  window.addEventListener('hashchange', () => {
    if (isSheetOpen()) closeSheet();
    render();
  });

  // 主题按钮：浅色 / 深色 一键切换（跟随系统在「我的」里设置）
  document.getElementById('theme-btn').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setSetting('theme', next);
    applyTheme(next);
  });

  // 中间「记一笔」按钮：任何页面都能直接记
  document.getElementById('tab-add').addEventListener('click', () => {
    openRecordSheet({ onChange: () => render() });
  });

  // 点击遮罩关闭弹层
  document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSheetOpen()) closeSheet();
  });

  // 数据变化时刷新当前页（计时页自己订阅，避免重绘打断动画）
  subscribe(() => {
    pushWidget();
    const { name } = parseHash();
    if (name === 'timer') return;
    if (name !== currentRoute) { render(); return; }
    softRefresh();
  });

  if (!location.hash) location.hash = '#/home';
  render();
  pushWidget();

  // 注册 Service Worker（离线可用；Android 壳不需要）
  if (!window.AndroidApp && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Android 壳的返回键：优先关弹层，再走 WebView 历史
  window.__closeSheetForBack = () => {
    if (isSheetOpen()) { closeSheet(); return true; }
    return false;
  };
}

boot();

/* v1.9：把今日进度推给 Android 桌面小组件（今日 N 分钟 · 连续 M 天）。
   只在壳里且有桥时调用；Web/PWA 里 AndroidApp 不存在，直接跳过。 */
function pushWidget() {
  try {
    const bridge = window.AndroidApp;
    if (!bridge || typeof bridge.updateWidget !== 'function') return;
    bridge.updateWidget(String(minutesOfDay(dateKey(new Date()))), String(streak()));
  } catch (e) { /* 小组件只是锦上添花，失败不影响主流程 */ }
}
