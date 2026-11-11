/* 数据层：本地持久化 + 状态订阅 */
import { uid, dateKey, addDays, parseKey } from './util.js';

// 便捷转发：视图与 report.js 统一从 store 取日期工具
import { startOfWeek } from './util.js';
export { uid, dateKey, addDays, parseKey, startOfWeek };

const KEY = 'study-tracker/v1';
const TIMER_KEY = 'study-tracker/timer';
const BACKUP_KEY = 'study-tracker/backup-latest';      // v1.3 单份快照（只用于迁移）
const BACKUPS_KEY = 'study-tracker/backups/v1';        // v1.4 多份快照
const BACKUPS_MAX = 7;
const TAGS_MAX = 6;
const CORRUPT_KEY_PREFIX = 'study-tracker/corrupt/';   // v1.6：读不动的原始数据留档，不静默丢弃
export const STORAGE_ERROR_EVENT = 'study-tracker:storage-error';  // 写盘失败广播（UI 收一次）
export const STORAGE_RECOVERED_EVENT = 'study-tracker:storage-recovered';  // 从失败恢复后广播一次，UI 收起提示条

export const COLORS = ['#4f6df5', '#7d5cff', '#12b76a', '#f79009', '#f04438', '#06aed4', '#e5489e', '#8b6b4a'];
export const EMOJIS = ['📐', '📘', '🧪', '🖥️', '🗣️', '🎨', '🎵', '📊', '⚖️', '🧠', '🔬', '📝', '🌏', '💡'];

/* 标签规范化：去 # 前缀、限长 12、去重、最多 6 个（旧数据无 tags 字段也能用） */
export function normTags(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[,，、\s]+/);
  const out = [];
  list.forEach((t) => {
    const v = String(t || '').trim().replace(/^#/, '').slice(0, 12);
    if (v && !out.includes(v)) out.push(v);
  });
  return out.slice(0, TAGS_MAX);
}

const defaultState = () => ({
  v: 1,
  settings: {
    theme: 'auto',
    dailyGoalMin: 120,
    weekStart: 1,
    pomodoroMin: 25,
    autoBackup: true,
    lastBackupDate: '',
  },
  subjects: [],
  sessions: [],
  templates: [],
  todos: [],
  reviews: {},
  demo: false,
  seeded: false,
  createdAt: Date.now(),
});

let state = defaultState();
const listeners = new Set();

/* v1.6 可靠性：读取恢复 / 写盘失败都留痕，由 UI 提示一次，不再只写 console */
let loadNotice = null;
let saveErrorNotified = false;
export function getLoadNotice() { const n = loadNotice; loadNotice = null; return n; }

/* v1.5 性能：聚合结果按「数据版本」缓存，写入时失效、读取时重算一次。
   记录页分页、统计页热力图（56 天）、连续天数等原本每次都全表扫描。 */
let allSortedCache = null;
let dayBucketCache = null;

function invalidateAggregates() {
  allSortedCache = null;
  dayBucketCache = null;
}

/* 日期 → { minutes, count, sessions }：一次 O(n) 建好，桶内按 end 倒序 */
function dayBuckets() {
  if (dayBucketCache) return dayBucketCache;
  const map = new Map();
  state.sessions.forEach((s) => {
    const key = dateKey(new Date(s.end));
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { minutes: 0, count: 0, sessions: [] };
      map.set(key, bucket);
    }
    bucket.minutes += s.minutes;
    bucket.count += 1;
    bucket.sessions.push(s);
  });
  map.forEach((b) => b.sessions.sort((x, y) => y.end - x.end));
  dayBucketCache = map;
  return map;
}

function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const subjects = (Array.isArray(raw.subjects) ? raw.subjects : []).map((s) => ({
    goalMinWeek: 0,
    archived: false,
    ...s,
  }));
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    subjects,
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).map((s) => ({
      ...s,
      tags: normTags(s.tags),
    })),
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    reviews: raw.reviews && typeof raw.reviews === 'object' ? raw.reviews : {},
  };
}

/* 损坏数据留档：键名带时间戳，方便用户自己捞回来。留档只保留最近 CORRUPT_MAX 份、
   30 天过期，否则这些「救生圈」自己就会把配额吃满（v1.7） */
const CORRUPT_MAX = 3;
const CORRUPT_TTL = 30 * 24 * 60 * 60 * 1000;

export function listCorrupt() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf(CORRUPT_KEY_PREFIX) !== 0) continue;
      const at = Number(key.slice(CORRUPT_KEY_PREFIX.length));
      out.push({
        key,
        at: Number.isFinite(at) ? at : 0,
        size: (localStorage.getItem(key) || '').length,
      });
    }
  } catch (_) { /* 隐私模式下读不到就算了 */ }
  return out.sort((a, b) => b.at - a.at);
}

function pruneCorrupt() {
  const all = listCorrupt();
  const now = Date.now();
  let removed = 0;
  for (const item of all) {
    if (item.at < now - CORRUPT_TTL) {
      try { localStorage.removeItem(item.key); removed++; } catch (_) {}
    }
  }
  for (const item of all.filter((x) => x.at >= now - CORRUPT_TTL).slice(CORRUPT_MAX)) {
    try { localStorage.removeItem(item.key); removed++; } catch (_) {}
  }
  return removed;
}

function keepCorrupt(raw) {
  try {
    const key = CORRUPT_KEY_PREFIX + Date.now();
    localStorage.setItem(key, raw);
    pruneCorrupt();
    return key;
  } catch (_) { return null; }
}

export function clearCorrupt() {
  let removed = 0;
  for (const item of listCorrupt()) {
    try { localStorage.removeItem(item.key); removed++; } catch (_) {}
  }
  return removed;
}

/* v1.7：粗算本项目在 localStorage 里占用的字节数（实时数据 + 快照 + 损坏留档），
   navigator.storage.estimate() 给不出 per-key 明细，这里自己量 */
export function estimateStorageBytes() {
  let total = 0;
  const add = (k) => {
    try {
      const v = localStorage.getItem(k);
      if (v) total += k.length + v.length;
    } catch (_) {}
  };
  add(KEY);
  add(BACKUPS_KEY);
  for (const item of listCorrupt()) total += item.key.length + item.size;
  return total;
}
/* 用最近一份可用快照拼回状态（不碰 localStorage，交给调用方决定是否落盘） */
function recoverFromBackup() {
  try {
    const hit = listBackups().find((b) => b && b.state && Array.isArray(b.state.sessions));
    if (!hit) return null;
    const next = normalize(hit.state);
    next.seeded = true;
    return next;
  } catch (_) { return null; }
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) {
    console.warn('[store] 读取失败', err);
    loadNotice = { kind: 'read-error', message: '本地数据读取失败，本次从空数据开始' };
  }
  if (raw) {
    try {
      state = normalize(JSON.parse(raw));
    } catch (err) {
      // v1.6：以前这里直接换空数据，下一次保存就把用户的数据覆盖掉了
      console.warn('[store] 数据损坏，尝试用备份恢复', err);
      const keptAt = keepCorrupt(raw);
      const recovered = recoverFromBackup();
      if (recovered) {
        state = recovered;
        save();
        loadNotice = { kind: 'recovered', keptAt, message: '数据文件损坏，已用最近一份备份恢复（原始内容已另存留档）' };
      } else {
        state = defaultState();
        loadNotice = { kind: 'corrupt', keptAt, message: '数据文件损坏且没有可用备份，已从空数据开始（原始内容已另存留档）' };
      }
    }
  } else {
    state = defaultState();
  }
  invalidateAggregates();
  if (!state.seeded && !state.subjects.length) {
    seedDemo();
    state.seeded = true;
    save();
  }
  checkAutoBackup();
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (saveErrorNotified) {
      saveErrorNotified = false;
      try { window.dispatchEvent(new CustomEvent(STORAGE_RECOVERED_EVENT)); } catch (_) {}
    }
  } catch (err) {
    console.warn('[store] 保存失败', err);
    // v1.6：写不进去必须让用户看见，否则关掉页面数据就没了
    if (!saveErrorNotified) {
      saveErrorNotified = true;
      try {
        window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, {
          detail: { name: (err && err.name) || 'Error', message: (err && err.message) || '' },
        }));
      } catch (_) {}
    }
  }
}

export function getState() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() {
  invalidateAggregates();
  save();
  listeners.forEach((fn) => { try { fn(state); } catch (err) { console.error(err); } });
}
function commit() { emit(); }

/* ---------- 科目 ---------- */
export function addSubject({ name, emoji, color, goalMinWeek = 0, archived = false }) {
  const subject = {
    id: uid(),
    name: String(name || '').trim() || '未命名科目',
    emoji: emoji || '📘',
    color: color || COLORS[0],
    goalMinWeek: Math.max(0, Math.round(Number(goalMinWeek) || 0)),
    archived: Boolean(archived),
    createdAt: Date.now(),
  };
  state.subjects.push(subject);
  commit();
  return subject;
}
export function updateSubject(id, patch) {
  const s = state.subjects.find((x) => x.id === id);
  if (!s) return;
  const next = { ...patch };
  if (next.goalMinWeek !== undefined) {
    next.goalMinWeek = Math.max(0, Math.round(Number(next.goalMinWeek) || 0));
  }
  if (next.archived !== undefined) {
    next.archived = Boolean(next.archived);
  }
  Object.assign(s, next);
  commit();
}
export function archiveSubject(id, archived = true) {
  updateSubject(id, { archived: Boolean(archived) });
}
export function removeSubject(id) {
  state.subjects = state.subjects.filter((s) => s.id !== id);
  state.sessions = state.sessions.filter((s) => s.subjectId !== id);
  commit();
}
export function getSubject(id) {
  return state.subjects.find((s) => s.id === id) || null;
}
export function activeSubjects() {
  return state.subjects.filter((s) => !s.archived);
}
export function archivedSubjects() {
  return state.subjects.filter((s) => Boolean(s.archived));
}

/* ---------- 记录 ----------
   一条记录 = 学了什么（title）+ 多久（minutes）+ 心得笔记（note）
   minutes 允许为 0：只记内容、不记时长的学习也算一条记录 */
export function addSession({
  subjectId, start, end, minutes, title = '', note = '', demo = false, tags = [],
}) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const endTs = Number(end) || Date.now();
  const session = {
    id: uid(),
    subjectId: subjectId || null,
    start: Number(start) || endTs - m * 60000,
    end: endTs,
    minutes: m,
    title: String(title || '').trim(),
    note: String(note || ''),
    demo: Boolean(demo),
    tags: normTags(tags),
  };
  state.sessions.push(session);
  commit();
  checkAutoBackup();
  return session;
}
export function updateSession(id, patch) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return null;
  const next = { ...patch };
  if (next.title !== undefined) next.title = String(next.title || '').trim();
  if (next.tags !== undefined) next.tags = normTags(next.tags);
  if (next.minutes !== undefined) {
    next.minutes = Math.max(0, Math.round(Number(next.minutes) || 0));
    const end = Number(next.end) || s.end;
    next.end = end;
    next.start = end - next.minutes * 60000;
  }
  Object.assign(s, next);
  commit();
  return s;
}
export function getSession(id) {
  return state.sessions.find((s) => s.id === id) || null;
}
export function removeSession(id) {
  const idx = state.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const [removed] = state.sessions.splice(idx, 1);
  commit();
  return removed;
}
/* v1.7 批量删除：一次移除多条只 commit 一次（避免逐条删除反复写盘）；
   动手前先留一份「删除前保护」快照，误删多条也能整体找回 */
export function removeSessions(ids) {
  const set = new Set(ids);
  const removed = state.sessions.filter((s) => set.has(s.id));
  if (!removed.length) return [];
  saveBackupSnapshot('pre-batch');
  state.sessions = state.sessions.filter((s) => !set.has(s.id));
  commit();
  return removed;
}
/* 撤销删除：原样放回（保留 id 与时间，避免重复插入） */
export function restoreSession(session) {
  if (!session || !session.id) return null;
  if (state.sessions.some((s) => s.id === session.id)) return session;
  const restored = { ...session, tags: normTags(session.tags) };
  state.sessions.push(restored);
  commit();
  return restored;
}

export function allSessions() {
  if (!allSortedCache) allSortedCache = [...state.sessions].sort((a, b) => b.end - a.end);
  return allSortedCache.slice();
}
export function sessionsOfDay(key = dateKey()) {
  const bucket = dayBuckets().get(key);
  return bucket ? bucket.sessions.slice() : [];
}
/* 记录查询（v1.4）：分页 + 科目/标签/时间段筛选
   opts: { q, subjectId, tag, fromKey, toKey, offset, limit }；limit<=0 表示不分页
   返回 { items, total, totalMin, hasMore }，total/totalMin 始终是全量口径 */
export function querySessions({
  q = '', subjectId = null, tag = null, fromKey = null, toKey = null, offset = 0, limit = 0,
} = {}) {
  const kw = String(q || '').trim().toLowerCase();
  const tagKey = tag ? String(tag).trim() : '';
  const from = fromKey ? parseKey(fromKey).getTime() : null;
  const to = toKey ? parseKey(toKey).getTime() + 86399999 : null;
  /* 科目名查一次就够（原先每条命中都 find 一遍） */
  const subjectName = new Map(state.subjects.map((s) => [s.id, s.name]));
  const hits = allSessions().filter((s) => {
    if (subjectId && s.subjectId !== subjectId) return false;
    if (tagKey && !(Array.isArray(s.tags) && s.tags.includes(tagKey))) return false;
    if (from !== null && s.end < from) return false;
    if (to !== null && s.end > to) return false;
    if (!kw) return true;
    const tagText = Array.isArray(s.tags) ? s.tags.join(' ') : '';
    const hay = `${s.title || ''} ${s.note || ''} ${tagText} ${subjectName.get(s.subjectId) || ''}`.toLowerCase();
    return hay.includes(kw);
  });
  const totalMin = hits.reduce((sum, s) => sum + s.minutes, 0);
  const start = Math.max(0, Number(offset) || 0);
  const size = Number(limit) > 0 ? Number(limit) : 0;
  const items = size ? hits.slice(start, start + size) : hits.slice(start);
  return {
    items,
    total: hits.length,
    totalMin,
    hasMore: size ? start + items.length < hits.length : false,
  };
}
/* 兼容旧签名：不传 limit 时返回全部命中（不再有 200 条上限） */
export function searchSessions(q, { subjectId = null, limit = 0 } = {}) {
  return querySessions({ q, subjectId, limit }).items;
}
/* 全部标签及出现次数，按次数降序 */
export function allTags() {
  const map = new Map();
  state.sessions.forEach((s) => {
    (Array.isArray(s.tags) ? s.tags : []).forEach((t) => map.set(t, (map.get(t) || 0) + 1));
  });
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
}
/* v1.10：标签使用统计（出现次数 + 累计分钟），次数降序 */
export function tagStats() {
  const map = new Map();
  state.sessions.forEach((s) => {
    (Array.isArray(s.tags) ? s.tags : []).forEach((t) => {
      const row = map.get(t) || { tag: t, count: 0, minutes: 0 };
      row.count += 1;
      row.minutes += s.minutes || 0;
      map.set(t, row);
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes || (a.tag < b.tag ? -1 : 1));
}

/* v1.10：把标签 from 改为 to（to 已存在即合并）。记录与模板一起改，返回受影响记录数 */
export function renameTag(from, to) {
  const src = normTags([from])[0];
  const dst = normTags([to])[0];
  if (!src || !dst || src === dst) return 0;
  const has = state.sessions.some((s) => Array.isArray(s.tags) && s.tags.includes(src))
    || state.templates.some((t) => Array.isArray(t.tags) && t.tags.includes(src));
  if (!has) return 0;
  saveBackupSnapshot('pre-tag');
  let n = 0;
  const swap = (tags) => {
    const arr = Array.isArray(tags) ? tags : [];
    if (!arr.includes(src)) return null;
    const next = [];
    arr.forEach((t) => {
      const v = t === src ? dst : t;
      if (!next.includes(v)) next.push(v);
    });
    return next.slice(0, TAGS_MAX);
  };
  state.sessions.forEach((s) => {
    const next = swap(s.tags);
    if (next) { s.tags = next; n += 1; }
  });
  state.templates.forEach((t) => {
    const next = swap(t.tags);
    if (next) t.tags = next;
  });
  if (n) commit();
  return n;
}

/* v1.10：从所有记录与模板上删除标签，返回受影响记录数 */
export function removeTag(tag) {
  const src = normTags([tag])[0];
  if (!src) return 0;
  const has = state.sessions.some((s) => Array.isArray(s.tags) && s.tags.includes(src))
    || state.templates.some((t) => Array.isArray(t.tags) && t.tags.includes(src));
  if (!has) return 0;
  saveBackupSnapshot('pre-tag');
  let n = 0;
  const strip = (tags) => {
    const arr = Array.isArray(tags) ? tags : [];
    return arr.includes(src) ? arr.filter((t) => t !== src) : null;
  };
  state.sessions.forEach((s) => {
    const next = strip(s.tags);
    if (next) { s.tags = next; n += 1; }
  });
  state.templates.forEach((t) => {
    const next = strip(t.tags);
    if (next) t.tags = next;
  });
  if (n) commit();
  return n;
}

/* 按天分组（用于时间线）：返回 [{key, date, sessions, minutes}]，新到旧 */
export function groupByDay(sessions) {
  const map = new Map();
  sessions.forEach((s) => {
    const key = dateKey(new Date(s.end));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      date: parseKey(key),
      sessions: list.sort((a, b) => b.end - a.end),
      minutes: list.reduce((sum, s) => sum + s.minutes, 0),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}
export function minutesOfDay(key = dateKey()) {
  const bucket = dayBuckets().get(key);
  return bucket ? bucket.minutes : 0;
}
export function minutesBetween(fromKey, toKey) {
  const from = parseKey(fromKey).getTime();
  const to = parseKey(toKey).getTime() + 86399999;
  return state.sessions
    .filter((s) => s.end >= from && s.end <= to)
    .reduce((sum, s) => sum + s.minutes, 0);
}
export function lastNDays(n, endDate = new Date()) {
  const days = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = addDays(endDate, -i);
    const key = dateKey(d);
    days.push({ date: d, key, minutes: minutesOfDay(key) });
  }
  return days;
}
export function streak() {
  let n = 0;
  let cursor = new Date();
  if (minutesOfDay(dateKey(cursor)) === 0) cursor = addDays(cursor, -1);
  while (minutesOfDay(dateKey(cursor)) > 0) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/* ---------- 统计辅助（v1.4） ---------- */
/* 每天分钟数 Map：key -> minutes（只含有记录的日期） */
export function dayMinutesMap() {
  const map = new Map();
  dayBuckets().forEach((b, k) => map.set(k, b.minutes > 0 ? b.minutes : 0));
  return map;
}
/* 区间合计 { minutes, count, days } */
export function rangeSummary(fromKey, toKey) {
  const from = parseKey(fromKey).getTime();
  const to = parseKey(toKey).getTime() + 86399999;
  const list = state.sessions.filter((s) => s.end >= from && s.end <= to);
  const days = new Set(list.map((s) => dateKey(new Date(s.end))));
  return {
    minutes: list.reduce((sum, s) => sum + s.minutes, 0),
    count: list.length,
    days: days.size,
  };
}
/* 最佳单日 { key, minutes, count } | null */
export function bestDay() {
  let best = null;
  dayMinutesMap().forEach((minutes, key) => {
    if (minutes > 0 && (!best || minutes > best.minutes)) best = { key, minutes };
  });
  if (!best) return null;
  best.count = dayBuckets().get(best.key) ? dayBuckets().get(best.key).count : 0;
  return best;
}
/* 历史最长连续记录天数 */
export function longestStreak() {
  const keys = [...dayMinutesMap().entries()]
    .filter(([, m]) => m > 0)
    .map(([k]) => k)
    .sort();
  let best = 0;
  let run = 0;
  let prev = null;
  keys.forEach((k) => {
    run = prev && dateKey(addDays(parseKey(prev), 1)) === k ? run + 1 : 1;
    prev = k;
    if (run > best) best = run;
  });
  return best;
}

/* ---------- 记一笔模板（v1.4） ---------- */
export function getTemplates() {
  return [...state.templates].sort(
    (a, b) => (b.usedAt || 0) - (a.usedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0),
  );
}
export function addTemplate({ subjectId = null, title = '', minutes = 0, tags = [] }) {
  const tpl = {
    id: uid(),
    subjectId: subjectId || null,
    title: String(title || '').trim().slice(0, 40),
    minutes: Math.max(0, Math.round(Number(minutes) || 0)),
    tags: normTags(tags),
    createdAt: Date.now(),
    usedAt: 0,
  };
  if (!tpl.title) return null;
  state.templates.push(tpl);
  if (state.templates.length > 20) state.templates = getTemplates().slice(0, 20);
  commit();
  return tpl;
}
export function touchTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  if (!t) return;
  t.usedAt = Date.now();
  commit();
}
export function removeTemplate(id) {
  state.templates = state.templates.filter((t) => t.id !== id);
  commit();
}

/* ---------- 今日任务 ---------- */
export function addTodo(text) {
  const todo = { id: uid(), text: String(text || '').trim(), done: false, createdAt: Date.now() };
  if (!todo.text) return null;
  state.todos.push(todo);
  commit();
  return todo;
}
export function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  commit();
}
export function removeTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  commit();
}

/* ---------- 设置 / 复盘 ---------- */
export function setSetting(key, value) {
  state.settings[key] = value;
  commit();
}
export function setReview(key, patch) {
  state.reviews[key] = { ...(state.reviews[key] || {}), ...patch };
  commit();
}
export function getReview(key) {
  return state.reviews[key] || {};
}

/* ---------- 计时器持久化 ---------- */
export function loadTimer() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}
export function saveTimer(t) {
  try {
    if (!t) localStorage.removeItem(TIMER_KEY);
    else localStorage.setItem(TIMER_KEY, JSON.stringify(t));
  } catch (_) {}
}

/* ---------- 示例数据 ---------- */
function seedDemo() {
  const plan = [
    { name: '高等数学', emoji: '📐', color: COLORS[0], w: 1.2 },
    { name: '数据结构', emoji: '🖥️', color: COLORS[1], w: 1.0 },
    { name: '英语', emoji: '🗣️', color: COLORS[2], w: 0.8 },
    { name: '算法竞赛', emoji: '🧠', color: COLORS[3], w: 0.7 },
  ];
  plan.forEach((p) => {
    state.subjects.push({
      id: uid(), name: p.name, emoji: p.emoji, color: p.color,
      goalMinWeek: [300, 240, 180, 120][state.subjects.length % 4] || 180,
      archived: false,
      createdAt: Date.now(),
    });
  });
  /* 示例记录：重点是「学了什么」，所以每条都写具体内容 */
  const library = {
    '高等数学': [
      ['极限的定义与性质', 'ε-δ 语言还是有点绕，明天再看一遍课本 2.1'],
      ['第三章 导数计算', '复合函数求导链式法则做了 12 题，错了 2 题'],
      ['泰勒展开', '记住 e^x、sin x、ln(1+x) 三个展开式'],
      ['定积分换元法', ''],
      ['中值定理三个条件', '罗尔 / 拉格朗日 / 柯西的区别抄了一页'],
      ['级数收敛判别', '比值判别法和根值判别法各做了 5 题'],
      ['二重积分极坐标', '雅可比行列式那块再算一遍'],
      ['多元函数偏导', '隐函数求导公式背下来了'],
    ],
    '数据结构': [
      ['二叉树遍历', '前中后序 + 层序都手写了一遍'],
      ['红黑树插入调整', '旋转那部分没完全懂，只记了结论'],
      ['哈希表冲突处理', '开放定址 vs 链地址法对比整理成表格'],
      ['堆排序实现', '建堆 O(n)、排序 O(n log n) 推导看懂了'],
      ['并查集路径压缩', '按秩合并和路径压缩一起写了个模板'],
      ['图的邻接表存储', 'DFS / BFS 都跑通了'],
      ['栈与队列应用题', '括号匹配、滑动窗口最大值'],
      ['Trie 前缀树', '实现 insert / search / startsWith 三个方法'],
    ],
    '英语': [
      ['背单词 Unit 7', '新词 30 个，复习 60 个，错 8 个'],
      ['精读经济学人一篇', '讲 remote work 的，整理了 12 个表达'],
      ['听力 Section 3', '对话题，正确率 8/10'],
      ['写作 Task 2 练习', '教育类话题，写了 280 词'],
      ['口语 Part 2 录音', '描述一次旅行，卡了两次'],
      ['语法：虚拟语气', 'if 从句三种时态对照整理'],
    ],
    '算法竞赛': [
      ['背包问题九讲', '01 背包、完全背包状态转移都推了一遍'],
      ['Codeforces 补题', 'C 题卡在贪心证明，看了题解'],
      ['图论：最短路', 'Dijkstra 堆优化模板默写'],
      ['树形 DP 入门', '没有上司的舞会那道题想通了'],
      ['数论：快速幂', '矩阵快速幂求斐波那契'],
      ['区间 DP', '石子合并，三重循环的枚举顺序是关键'],
      ['二分答案', '最大值最小化类问题套路总结'],
    ],
  };
  const now = new Date();
  // 每个科目的内容按顺序轮着取，避免示例数据里同一标题反复出现
  const cursor = {};
  for (let i = 27; i >= 0; i -= 1) {
    const day = addDays(now, -i);
    // 今天一定有记录，保证首次打开时「今日」页不是空的
    if (i > 0 && Math.random() < 0.16) continue;
    const count = i === 0 ? 2 : 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < count; j += 1) {
      const subject = state.subjects[Math.floor(Math.random() * state.subjects.length)];
      const pool = library[subject.name] || [['学习记录', '']];
      const at = cursor[subject.name] || 0;
      cursor[subject.name] = at + 1;
      const [title, note] = pool[at % pool.length];
      const minutes = [25, 30, 45, 50, 60, 90][Math.floor(Math.random() * 6)];
      const hour = 9 + Math.floor(Math.random() * 11);
      let end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 30).getTime();
      // 今天的记录不能落在未来
      if (end > Date.now()) end = Date.now() - (j + 1) * 3600000;
      if (end > Date.now()) continue;
      state.sessions.push({
        id: uid(), subjectId: subject.id, start: end - minutes * 60000, end,
        minutes, title, note, demo: true, tags: [],
      });
    }
  }
  state.todos = [
    { id: uid(), text: '数学：第三章习题 1-10', done: false, createdAt: Date.now(), demo: true },
    { id: uid(), text: '英语：背 30 个单词', done: true, createdAt: Date.now(), demo: true },
  ];
  state.demo = true;
  state.seeded = true;
  save();
}

/* 移除示例数据：只删带 demo 标记的记录与任务，用户自己加的统统保留 */
export function clearDemo() {
  const removed = state.sessions.filter((s) => s.demo).length;
  state.sessions = state.sessions.filter((s) => !s.demo);
  state.todos = state.todos.filter((t) => !t.demo);
  state.demo = false;
  commit();
  return removed;
}
export function hasDemoData() {
  return Boolean(state.demo)
    || state.sessions.some((s) => s.demo)
    || state.todos.some((t) => t.demo);
}
export function resetAll() {
  saveBackupSnapshot('pre-clear');   // v1.6：清空前先留一份，别让「不可恢复」变成真的
  state = defaultState();
  state.seeded = true;   // 用户主动清空后，不再自动灌入示例数据
  save();
  listeners.forEach((fn) => fn(state));
}

export function exportJSON() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2);
}
/* 导入：mode='replace' 覆盖（默认，兼容旧调用）；mode='merge' 合并（科目同名复用、记录按 id 去重） */
export function importJSON(text, { mode = 'replace' } = {}) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.subjects) && !Array.isArray(raw.sessions))) {
    throw new Error('不是有效的备份文件');
  }
  const incoming = normalize(raw);
  saveBackupSnapshot('pre-import');   // 合并与覆盖都先留一份，误点也能回去
  if (mode === 'merge') return mergeState(incoming);
  state = incoming;
  state.seeded = true;   // 导入即视为已初始化，不再追加示例数据
  commit();
  return { mode: 'replace', addedSessions: incoming.sessions.length, addedSubjects: incoming.subjects.length };
}
function mergeState(incoming) {
  const beforeSessions = state.sessions.length;
  const byName = new Map(state.subjects.map((s) => [s.name, s]));
  const idMap = new Map();
  let addedSubjects = 0;
  incoming.subjects.forEach((s) => {
    const hit = byName.get(s.name);
    if (hit) { idMap.set(s.id, hit.id); return; }
    const copy = { ...s, id: s.id || uid() };
    state.subjects.push(copy);
    byName.set(copy.name, copy);
    idMap.set(s.id, copy.id);
    addedSubjects += 1;
  });
  const seen = new Set(state.sessions.map((s) => s.id));
  incoming.sessions.forEach((s) => {
    if (!s.id || seen.has(s.id)) return;
    state.sessions.push({
      ...s,
      subjectId: s.subjectId ? (idMap.get(s.subjectId) || s.subjectId) : null,
      tags: normTags(s.tags),
    });
    seen.add(s.id);
  });
  const todoTexts = new Set(state.todos.map((t) => t.text));
  incoming.todos.forEach((t) => {
    if (todoTexts.has(t.text)) return;
    state.todos.push({ ...t, id: t.id || uid() });
    todoTexts.add(t.text);
  });
  state.reviews = { ...incoming.reviews, ...state.reviews };
  state.seeded = true;
  commit();
  return {
    mode: 'merge',
    addedSessions: state.sessions.length - beforeSessions,
    addedSubjects,
  };
}

/* ---------- CSV 导入（v1.11） ----------
   records 来自 csv.js 的 csvToRecords()：{ subjectName,title,tags,minutes,note,start,end }
   科目按名字复用，名字不存在时自动新建（autoCreateSubjects）；
   dedupe 时按「科目 + 标题 + 开始时间 + 分钟」判重，重复的不再插入。
   整批只提交一次，导入前先存一份「导入前保护」快照。 */
export function importSessions(records, { autoCreateSubjects = true, dedupe = true } = {}) {
  if (!Array.isArray(records) || !records.length) {
    return { added: 0, duplicates: 0, createdSubjects: 0 };
  }
  saveBackupSnapshot('pre-import');
  const byName = new Map(state.subjects.map((s) => [String(s.name || '').trim(), s]));
  const keyOf = (sid, title, start, minutes) =>
    [sid || '', String(title || '').trim(), Number(start) || 0, Number(minutes) || 0].join('|');
  const seen = new Set(state.sessions.map((s) => keyOf(s.subjectId, s.title, s.start, s.minutes)));
  let added = 0;
  let duplicates = 0;
  let createdSubjects = 0;
  records.forEach((r) => {
    let subj = null;
    const name = String(r.subjectName || '').trim();
    if (name) {
      subj = byName.get(name) || null;
      if (!subj && autoCreateSubjects) {
        subj = {
          id: uid(),
          name: name.slice(0, 20) || '未命名科目',
          emoji: '📘',
          color: COLORS[state.subjects.length % COLORS.length],
          goalMinWeek: 0,
          archived: false,
          createdAt: Date.now(),
        };
        state.subjects.push(subj);
        byName.set(subj.name, subj);
        createdSubjects += 1;
      }
    }
    const minutes = Math.max(0, Math.round(Number(r.minutes) || 0));
    const end = Number(r.end) || Date.now();
    const start = Number(r.start) || end - minutes * 60000;
    const key = keyOf(subj ? subj.id : null, r.title, start, minutes);
    if (dedupe && seen.has(key)) { duplicates += 1; return; }
    state.sessions.push({
      id: uid(),
      subjectId: subj ? subj.id : null,
      start,
      end,
      minutes,
      title: String(r.title || '').trim().slice(0, 40),
      note: String(r.note || '').slice(0, 500),
      demo: false,
      tags: normTags(r.tags || []),
    });
    seen.add(key);
    added += 1;
  });
  if (added || createdSubjects) {
    commit();
    checkAutoBackup();
  }
  return { added, duplicates, createdSubjects };
}

/* ---------- 自动备份与快照（v1.4 保留最近 7 份） ---------- */
function readLegacyBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function writeBackups(list) {
  try {
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(list.slice(0, BACKUPS_MAX)));
  } catch (err) {
    console.warn('[store] 快照写入失败', err);
  }
}
/* 快照列表，新到旧；首次读取时把 v1.3 的单份快照迁移过来 */
export function listBackups() {
  let list = [];
  try {
    const raw = localStorage.getItem(BACKUPS_KEY);
    list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
  } catch (_) { list = []; }
  if (!list.length) {
    const legacy = readLegacyBackup();
    if (legacy && legacy.state) {
      list = [{
        id: `legacy-${legacy.backupAt || Date.now()}`,
        name: '旧版自动备份',
        reason: legacy.reason || 'legacy',
        backupAt: legacy.backupAt || Date.now(),
        backupDate: legacy.backupDate || dateKey(new Date(legacy.backupAt || Date.now())),
        sessions: (legacy.state.sessions || []).length,
        state: legacy.state,
      }];
      writeBackups(list);
    }
  }
  return list;
}
export function getLatestBackup() {
  const list = listBackups();
  if (!list.length) return null;
  const top = list[0];
  return { backupAt: top.backupAt, backupDate: top.backupDate, reason: top.reason, state: top.state };
}
function backupLabel(reason) {
  if (reason === 'auto-daily') return '每日自动';
  if (reason === 'pre-restore') return '恢复前保护';
  if (reason === 'pre-import') return '导入前保护';
  if (reason === 'pre-clear') return '清空前保护';
  if (reason === 'pre-batch') return '删除前保护';
  if (reason === 'pre-tag') return '标签操作前保护';
  return '手动备份';
}
export function saveBackupSnapshot(reason = 'manual', name = '') {
  try {
    const payload = {
      id: uid(),
      name: String(name || '').trim().slice(0, 20) || backupLabel(reason),
      reason,
      backupAt: Date.now(),
      backupDate: dateKey(),
      sessions: state.sessions.length,
      subjects: state.subjects.length,
      state: JSON.parse(JSON.stringify(state)),
    };
    writeBackups([payload, ...listBackups()]);
    if (window.AndroidApp && window.AndroidApp.saveBackupQuietly) {
      window.AndroidApp.saveBackupQuietly(`study-tracker-autobackup-${dateKey()}.json`, exportJSON());
    }
    return payload;
  } catch (err) {
    console.warn('[store] 自动备份保存失败', err);
    return null;
  }
}
export function removeBackup(id) {
  writeBackups(listBackups().filter((b) => b.id !== id));
}

export function checkAutoBackup() {
  if (state.settings.autoBackup === false) return;
  const today = dateKey();
  if (state.settings.lastBackupDate === today) return;
  const latest = listBackups()[0];
  if (latest && latest.reason === 'auto-daily' && latest.backupDate === today) {
    state.settings.lastBackupDate = today;   // 今天已有自动快照（例如用户清空后重建），不重复写
    save();
    return;
  }
  if (state.subjects.length > 0 || state.sessions.length > 0) {
    saveBackupSnapshot('auto-daily');
    state.settings.lastBackupDate = today;
    save();
  }
}

/* 恢复指定快照（不传 id 取最新一份）；恢复前先自动存一份“恢复前保护” */
export function restoreBackup(id) {
  const list = listBackups();
  const target = id ? list.find((b) => b.id === id) : list[0];
  if (!target || !target.state) throw new Error('没有可用的备份快照');
  saveBackupSnapshot('pre-restore');
  state = normalize(target.state);
  state.seeded = true;
  commit();
  return target;
}
export function restoreLatestBackup() {
  return restoreBackup(null);
}
