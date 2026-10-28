/* 计时器：正计时 / 倒计时，独立于视图运行，刷新不丢失 */
import { loadTimer, saveTimer, addSession, getState } from './store.js';
import { uid } from './util.js';

export const MODES = {
  focus: { label: '专注' },
  short: { label: '短休息' },
  long: { label: '长休息' },
};

const DEFAULTS = { focus: 25, short: 5, long: 15 };

const listeners = new Set();

const state = {
  mode: 'focus',
  style: 'up',          // up = 正计时（专注）| down = 倒计时
  status: 'idle',       // idle | running | paused
  targetMs: 25 * 60000,
  accumulatedMs: 0,
  startedAt: 0,
  subjectId: null,
  startedAtWall: 0,
  sessionId: null,
  targetReached: false,
};

let ticker = 0;

export function subscribeTimer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => { try { fn(state); } catch (err) { console.error(err); } });
}

function persist() {
  saveTimer({
    mode: state.mode,
    style: state.style,
    status: state.status,
    targetMs: state.targetMs,
    accumulatedMs: state.accumulatedMs,
    startedAt: state.startedAt,
    subjectId: state.subjectId,
    startedAtWall: state.startedAtWall,
    sessionId: state.sessionId,
    targetReached: state.targetReached,
  });
}

export function elapsedMs() {
  const live = state.status === 'running' ? Date.now() - state.startedAt : 0;
  return state.accumulatedMs + live;
}
export function remainingMs() {
  return Math.max(0, state.targetMs - elapsedMs());
}
export function progress() {
  if (!state.targetMs) return 0;
  return Math.min(1, elapsedMs() / state.targetMs);
}
export function displayMs() {
  return state.style === 'down' ? remainingMs() : elapsedMs();
}
export function getTimer() { return state; }
export function isActive() {
  return state.status !== 'idle' || state.accumulatedMs > 0;
}

export function configure({ mode, style, targetMin, subjectId } = {}) {
  if (state.status === 'running') return false;
  if (mode && MODES[mode]) {
    state.mode = mode;
    if (mode !== 'focus') { state.style = 'down'; state.targetMs = DEFAULTS[mode] * 60000; }
  }
  if (style === 'up' || style === 'down') {
    state.style = state.mode === 'focus' ? style : 'down';
  }
  if (targetMin) state.targetMs = Math.max(1, Math.round(targetMin)) * 60000;
  if (subjectId !== undefined) state.subjectId = subjectId;
  reset({ silent: true });
  persist();
  emit();
  return true;
}

export function setSubject(subjectId) {
  state.subjectId = subjectId;
  persist();
  emit();
}

export function start() {
  if (state.status === 'running') return;
  if (!state.sessionId) state.sessionId = uid();
  const now = Date.now();
  state.status = 'running';
  state.startedAt = now;
  if (!state.startedAtWall) state.startedAtWall = now;
  persist();
  ensureTicker();
  updateOngoing();
  emit();
}

export function pause() {
  if (state.status !== 'running') return;
  state.accumulatedMs += Date.now() - state.startedAt;
  state.startedAt = 0;
  state.status = 'paused';
  persist();
  updateOngoing();
  emit();
}

export function toggle() {
  if (state.status === 'running') pause();
  else start();
}

export function reset({ silent = false } = {}) {
  stopTicker();
  state.status = 'idle';
  state.accumulatedMs = 0;
  state.startedAt = 0;
  state.startedAtWall = 0;
  state.targetReached = false;
  state.sessionId = uid();
  persist();
  updateOngoing();
  if (!silent) emit();
}

/** 结束并落库。返回 { ok, minutes } */
export function finish({ early = false } = {}) {
  const minutes = Math.round(elapsedMs() / 60000);
  const wasFocus = state.mode === 'focus';
  stopTicker();
  let logged = 0;
  let sessionId = null;
  if (wasFocus && minutes >= 1) {
    const end = Date.now();
    const created = addSession({
      subjectId: state.subjectId,
      start: state.startedAtWall || end - minutes * 60000,
      end,
      minutes,
      note: '',
    });
    sessionId = created.id;
    logged = minutes;
  }
  state.status = 'idle';
  state.accumulatedMs = 0;
  state.startedAt = 0;
  state.startedAtWall = 0;
  state.targetReached = false;
  state.sessionId = uid();
  persist();
  updateOngoing();
  emit();
  return { ok: logged > 0, minutes: logged, wasFocus, sessionId };
}

/* ---------- tick ---------- */
function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    if (state.status !== 'running') return;
    if (state.style === 'down' && remainingMs() <= 0) { complete(); return; }
    if (state.style === 'up' && !state.targetReached && elapsedMs() >= state.targetMs) {
      state.targetReached = true;
      persist();
      notify('目标达成', `已经专注 ${Math.round(state.targetMs / 60000)} 分钟，继续加油！`);
    }
    updateOngoing();
    emit();
  }, 500);
}
function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = 0; }
}
function complete() {
  const wasFocus = state.mode === 'focus';
  const result = finish({ early: false });
  if (wasFocus && result.ok) notify('专注完成', `本次 ${result.minutes} 分钟，已记入今天`);
  else notify('休息结束', '准备好开始下一段专注了吗？');
  listeners.forEach((fn) => { try { fn(state, { completed: true, result }); } catch (err) { console.error(err); } });
}

export function notify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(title, { body, icon: 'icon-512.png' });
  } catch (_) { /* 忽略 */ }
}

export function requestNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (_) {}
}

/* ---------- Android 常驻通知桥 ---------- */
function fmtClockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

let lastNotifText = '';
function updateOngoing() {
  try {
    const app = window.AndroidApp;
    if (!app || !app.updateTimerNotification) return;
    if (state.status === 'idle') {
      app.stopTimerNotification();
      lastNotifText = '';
      return;
    }
    const label = MODES[state.mode] ? MODES[state.mode].label : '专注';
    const clock = fmtClockText(displayMs());
    const statusText = state.status === 'running' ? '计时中' : '已暂停';
    const text = label + ' · ' + clock + ' · ' + statusText;
    if (text === lastNotifText) return;
    lastNotifText = text;
    app.updateTimerNotification(text, state.status === 'running');
  } catch (_) { /* 忽略 */ }
}

/** 页面加载时恢复 */
export function restore() {
  const saved = loadTimer();
  if (!saved) {
    const goal = getState().settings.pomodoroMin || 25;
    state.targetMs = goal * 60000;
    state.sessionId = uid();
    emit();
    return;
  }
  Object.assign(state, saved);
  if (!state.sessionId) state.sessionId = uid();
  if (state.status === 'running') {
    if (state.style === 'down' && remainingMs() <= 0) complete();
    else ensureTicker();
  }
  updateOngoing();
  emit();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden || state.status !== 'running') return;
  if (state.style === 'down' && remainingMs() <= 0) complete();
  else emit();
});
