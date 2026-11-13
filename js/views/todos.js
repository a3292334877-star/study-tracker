/* 任务中心（v1.32）：跨周查看所有任务、待办 / 逾期 / 已完成 */
import {
  taskOccurrences, nextTodoOccurrences, overdueTodos, rescheduleTodo, toggleTodo, setTodoDone, removeTodo, removeTodoSeries,
  addTodo, setTodoMinutes, getSubject, normRepeat, repeatLabel, todoOverview, dateKey, addDays, parseKey,
} from '../store.js';
import {
  esc, fmtMinShort, weekdayCN, monthDayCN, toast, haptic,
} from '../util.js';
import { openAddTask, openRepeatDeleteSheet } from './plan.js';
import { openRecordSheet } from '../sheets.js';

const FILTERS = [
  { id: 'pending', label: '待办' },
  { id: 'done', label: '已完成' },
  { id: 'all', label: '全部' },
];
const DAY_MS = 86400000;
function dayDiff(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/* 按当前筛选与搜索词收集任务；重复任务按天投影，逾期只算不重复的任务 */
function collect(filter, q) {
  const now = new Date();
  const todayKey = dateKey(now);
  let items = [];
  const pendingItems = () => overdueTodos(180)
    .concat(taskOccurrences(todayKey, dateKey(addDays(now, 60))).filter((t) => !t.done && normRepeat(t.repeat) === 'none'))
    .concat(nextTodoOccurrences(todayKey, 60));
  if (filter === 'pending') {
    items = pendingItems();
  } else if (filter === 'done') {
    items = taskOccurrences(dateKey(addDays(now, -30)), todayKey).filter((t) => t.done);
  } else {
    items = pendingItems().concat(taskOccurrences(dateKey(addDays(now, -30)), todayKey).filter((t) => t.done));
  }
  const map = new Map();
  items.forEach((t) => {
    const key = t.id + '|' + t.occurrence;
    if (!map.has(key)) map.set(key, t);
  });
  let list = Array.from(map.values());
  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((t) => {
      const subj = t.subjectId ? getSubject(t.subjectId) : null;
      return String(t.text || '').toLowerCase().includes(kw)
        || Boolean(subj && String(subj.name || '').toLowerCase().includes(kw));
    });
  }
  list.sort((a, b) => {
    if (a.occurrence !== b.occurrence) {
      if (filter === 'done') return a.occurrence < b.occurrence ? 1 : -1;
      return a.occurrence < b.occurrence ? -1 : 1;
    }
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
  return list;
}

function taskRow(t, todayKey) {
  const subj = t.subjectId ? getSubject(t.subjectId) : null;
  const isOverdue = t.occurrence < todayKey && !t.done;
  const subjectHtml = subj
    ? '<span class="plan-subject"><i style="background:' + (subj.color || 'var(--primary)') + '"></i>' + (subj.emoji || '📘') + ' ' + esc(subj.name) + '</span>'
    : '';
  const repeatHtml = repeatLabel(t.repeat) ? '<span class="plan-repeat">' + repeatLabel(t.repeat) + '</span>' : '';
  const durationHtml = t.minutes ? '<span class="plan-duration">⏱ ' + fmtMinShort(t.minutes) + '</span>' : '';
  const reschedHtml = isOverdue ? '<button class="todo-resched" type="button" data-act="resched" title="顺延到今天" aria-label="顺延到今天">顺延</button>' : '';
  const recordHtml = t.done ? '' : '<button class="task-record" type="button" data-act="record" title="记一笔" aria-label="记一笔">✎</button>';
  return '<div class="plan-task todo-task' + (t.done ? ' done' : '') + (isOverdue ? ' is-overdue' : '') + '" data-occ="' + t.occurrence + '" data-id="' + t.id + '" data-repeat="' + normRepeat(t.repeat) + '">'
    + '<button class="plan-check" type="button" data-act="toggle" aria-label="' + (t.done ? '标记未完成' : '标记完成') + '">' + (t.done ? '✓' : '○') + '</button>'
    + '<div class="plan-text"><span class="plan-title">' + esc(t.text) + '</span>' + subjectHtml + '</div>'
    + durationHtml
    + repeatHtml
    + reschedHtml
    + recordHtml
    + '<button class="row-chev" type="button" data-act="del" aria-label="删除任务">✕</button>'
    + '</div>';
}

function groupDateLabel(key, todayKey, tomorrowKey) {
  const d = parseKey(key);
  if (key === todayKey) return '今天 · ' + monthDayCN(d);
  if (key === tomorrowKey) return '明天 · ' + monthDayCN(d);
  return weekdayCN(d) + ' · ' + monthDayCN(d);
}

function listHtml(list, filter, todayKey, tomorrowKey) {
  if (!list.length) {
    const msg = filter === 'done' ? '还没有完成的任务' : filter === 'all' ? '还没有任务' : '没有待办任务，享受此刻 ☕';
    return '<div class="card todo-empty fade-in"><span class="em">🗒️</span><p>' + msg + '</p></div>';
  }
  const groups = new Map();
  list.forEach((t) => {
    if (!groups.has(t.occurrence)) groups.set(t.occurrence, []);
    groups.get(t.occurrence).push(t);
  });
  return Array.from(groups.entries()).map((entry) => {
    const key = entry[0];
    const items = entry[1];
    const pastDays = dayDiff(parseKey(key), parseKey(todayKey));
    const hasOverdue = pastDays > 0 && items.some((t) => !t.done);
    return '<section class="todo-group fade-in">'
      + '<div class="todo-group-head"><span>' + groupDateLabel(key, todayKey, tomorrowKey) + '</span>'
      + (hasOverdue ? '<em class="todo-overdue">逾期 ' + pastDays + ' 天</em>' : '')
      + '<span class="todo-group-count">' + items.length + ' 项</span></div>'
      + '<div class="card flat todo-group-card">' + items.map((t) => taskRow(t, todayKey)).join('') + '</div>'
      + '</section>';
  }).join('');
}

export function renderTodos(ctx) {
  const now = new Date();
  const todayKey = dateKey(now);
  const tomorrowKey = dateKey(addDays(now, 1));
  let filter = FILTERS.some((f) => f.id === ctx.query.f) ? ctx.query.f : 'pending';
  let q = '';
  let bodyEl = null;
  let countEl = null;

  const overview = todoOverview();
  const html = '<section class="hero todo-hero fade-in">'
    + '<div class="hero-label">任务中心</div>'
    + '<div class="hero-value"><b>' + overview.todayPending + '</b><span>项今日待办</span></div>'
    + '<div class="hero-sub">' + (overview.overdue ? overview.overdue + ' 项逾期' : '没有逾期任务') + ' · 未来 7 天还有 ' + overview.upcoming + ' 项</div>'
    + '</section>'
    + '<div class="search fade-in">'
    + '<svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
    + '<input id="todo-q" type="search" placeholder="搜任务内容、科目…" autocomplete="off" aria-label="搜索任务" />'
    + '<button class="clr" type="button" id="todo-clr" aria-label="清除搜索词" hidden>✕</button>'
    + '</div>'
    + '<div class="seg todo-seg fade-in" id="todo-seg" role="group" aria-label="任务筛选">'
    + FILTERS.map((f) => '<button type="button" data-filter="' + f.id + '" class="' + (f.id === filter ? 'on' : '') + '" aria-pressed="' + (f.id === filter ? 'true' : 'false') + '">' + f.label + '</button>').join('')
    + '</div>'
    + '<div class="todo-toolbar fade-in"><p class="hint" id="todo-count" aria-live="polite"></p>'
    + '<button class="btn primary todo-add" type="button" data-act="add">+ 添加任务</button></div>'
    + '<div id="todos-body"></div>';

  function paint() {
    const list = collect(filter, q);
    bodyEl.innerHTML = listHtml(list, filter, todayKey, tomorrowKey);
    countEl.textContent = filter === 'done'
      ? '共 ' + list.length + ' 项已完成'
      : filter === 'all' ? '共 ' + list.length + ' 项任务' : '共 ' + list.length + ' 项待办';
  }

  function mount(root) {
    bodyEl = root.querySelector('#todos-body');
    countEl = root.querySelector('#todo-count');
    root.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        paint();
      });
    });
    const input = root.querySelector('#todo-q');
    const clr = root.querySelector('#todo-clr');
    input.addEventListener('input', () => {
      q = input.value;
      clr.hidden = !q;
      paint();
    });
    clr.addEventListener('click', () => {
      input.value = '';
      q = '';
      clr.hidden = true;
      input.focus();
      paint();
    });
    root.querySelector('[data-act="add"]').addEventListener('click', async () => {
      const result = await openAddTask(todayKey);
      if (!result) return;
      const created = addTodo(result.text, todayKey, result.repeat, result.subjectId);
      if (created && result.minutes) setTodoMinutes(created.id, result.minutes);
      toast(result.repeat === 'none' ? '任务已添加' : '任务已添加 · ' + repeatLabel(result.repeat) + '重复');
    });
    bodyEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('[data-occ]');
      if (!row) return;
      const id = row.dataset.id;
      const key = row.dataset.occ;
      const rep = normRepeat(row.dataset.repeat);
      const act = btn.dataset.act;
      if (act === 'toggle') {
        haptic();
        toggleTodo(id, key);
      } else if (act === 'resched') {
        if (rescheduleTodo(id, todayKey)) toast('已顺延到今天');
      } else if (act === 'record') {
        const item = taskOccurrences(key, key).find((x) => x.id === id);
        if (!item) return;
        haptic();
        openRecordSheet({
          initial: { title: item.text, subjectId: item.subjectId || undefined, dateKey: key },
          onChange: () => {
            setTodoDone(id, key, true);
            toast('已记一笔 · 任务完成 ✓');
          },
        });
      } else if (act === 'del') {
        if (rep === 'none') {
          removeTodo(id, key);
          return;
        }
        const item = taskOccurrences(key, key).find((x) => x.id === id);
        const choice = await openRepeatDeleteSheet(item ? item.text : '', rep, key);
        if (choice === 'skip') {
          removeTodo(id, key);
          toast('已跳过这一天');
        } else if (choice === 'all') {
          removeTodoSeries(id);
          toast('已删除整个重复任务');
        }
      }
    });
    paint();
  }

  function refresh() {
    if (bodyEl) paint();
  }

  return { title: '任务中心', sub: '所有待办与逾期任务', html, mount, refresh };
}
