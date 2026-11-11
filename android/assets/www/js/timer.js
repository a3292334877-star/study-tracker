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
  cycleRound: 1,       // 番茄循环：当前处于第几轮专注（v1.13）
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
    cycleRound: state.cycleRound,
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

/* ---------- 番茄循环（v1.13） ---------- */
/** 读取番茄循环设置（来自 settings，缺失时用默认值） */
export function getCycle() {
  const s = (getState().settings) || {};
  return {
    enabled: s.pomodoroCycle === true,
    focusMin: Math.max(1, Math.round(s.pomodoroMin || 25)),
    shortMin: Math.max(1, Math.round(s.pomodoroShortMin || 5)),
    longMin: Math.max(1, Math.round(s.pomodoroLongMin || 15)),
    roundsPerLong: Math.max(1, Math.round(s.pomodoroRounds || 4)),
    round: state.cycleRound || 1,
  };
}

/** 纯函数：给定当前阶段与轮次，算出下一阶段。方便单测。 */
export function planNextPhase({ mode, round, roundsPerLong, focusMin, shortMin, longMin }) {
  const r = Math.max(1, Math.round(round || 1));
  const per = Math.max(1, Math.round(roundsPerLong || 4));
  if (mode === 'focus') {
    const isLong = r % per === 0;
    return { mode: isLong ? 'long' : 'short', targetMin: isLong ? Math.max(1, Math.round(longMin || 15)) : Math.max(1, Math.round(shortMin || 5)), round: r };
  }
  const nextRound = r + 1;
  return { mode: 'focus', targetMin: Math.max(1, Math.round(focusMin || 25)), round: nextRound > per ? 1 : nextRound };
}

/** 把轮次拨回第 1 轮（开启番茄循环 / 手动重置时用） */
export function restartCycle() {
  state.cycleRound = 1;
  persist();
  emit();
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
  const cyc = getCycle();
  const result = finish({ early: false });

  let next = null;
  if (cyc.enabled) {
    next = planNextPhase({
      mode: wasFocus ? 'focus' : state.mode,
      round: state.cycleRound,
      roundsPerLong: cyc.roundsPerLong,
      focusMin: cyc.focusMin,
      shortMin: cyc.shortMin,
      longMin: cyc.longMin,
    });
  }

  if (wasFocus && result.ok) {
    if (cyc.enabled && next) {
      notify('专注完成', `本次 ${result.minutes} 分钟，${next.mode === 'long' ? '长休息' : '短休息'} ${next.targetMin} 分钟`);
    } else {
      notify('专注完成', `本次 ${result.minutes} 分钟，已记入今天`);
    }
  } else if (cyc.enabled && next) {
    notify('休息结束', `开始第 ${next.round} 轮专注`);
  } else {
    notify('休息结束', '准备好开始下一段专注了吗？');
  }

  if (cyc.enabled && next) {
    if (next.mode === 'focus') state.cycleRound = next.round;
    configure({ mode: next.mode, targetMin: next.targetMin });
    start();   // 自动进入下一段：专注后自动休息，休息后自动专注
  }

  listeners.forEach((fn) => { try { fn(state, { completed: true, result, cycle: next }); } catch (err) { console.error(err); } });
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
