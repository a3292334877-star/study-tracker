/* 任务中心（v1.32）：跨周查看所有任务、待办 / 逾期 / 已完成 */
import {
  taskOccurrences, nextTodoOccurrences, overdueTodos, rescheduleTodo, toggleTodo, setTodoDone, removeTodo, removeTodoSeries,
  addTodo, setTodoMinutes, getSubject, activeSubjects, normRepeat, repeatLabel, todoOverview, dateKey, addDays, parseKey,
  getTodo, updateTodo, rescheduleTodoOccurrence,
  completeTodoOccurrences, rescheduleTodoOccurrences, removeTodoOccurrences,
} from '../store.js';
import {
  esc, fmtMinShort, weekdayCN, monthDayCN, toast, haptic, openSheet, closeSheet, confirmSheet,
} from '../util.js';
import { openAddTask, openRepeatDeleteSheet } from './plan.js';
import { openRecordSheet } from '../sheets.js';

const FILTERS = [
  { id: 'pending', label: '待办' },
  { id: 'done', label: '已完成' },
  { id: 'all', label: '全部' },
];
const DAY_MS = 86400000;
function occKey(t) { return t.id + '|' + t.occurrence; }
function dayDiff(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

const EDIT_MINUTES = [0, 15, 30, 45, 60, 90];
/* v1.34：编辑任务弹层：内容 / 科目 / 预计时长 / 日期，返回 { text, subjectId, minutes, dateKey } 或 null。
   重复任务的内容改动套用到整个系列，日期改动只调整当前这一天。 */
function openEditTodoSheet(item) {
  const subjects = activeSubjects();
  const isRepeat = normRepeat(item.repeat) !== 'none';
  const currentMinutes = Math.max(0, Math.round(Number(item.minutes) || 0));
  const minOptions = EDIT_MINUTES.includes(currentMinutes)
    ? EDIT_MINUTES
    : EDIT_MINUTES.concat([currentMinutes]).sort((a, b) => a - b);
  return new Promise((resolve) => {
    let done = false;
    let subjectId = item.subjectId || null;
    let minutes = currentMinutes;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeSheet();
      resolve(val);
    };
    openSheet(
      `<h2 class="sheet-title">编辑任务</h2>
      <p class="sheet-desc">${isRepeat ? '这是重复任务：内容、科目和时长会套用到所有日期；改日期只调整这一次。' : '修改任务内容、科目、预计时长或日期。'}</p>
      <div class="field">
        <label for="todo-edit-text">任务内容</label>
        <input class="input" id="todo-edit-text" maxlength="40" value="${esc(item.text)}" />
      </div>
      <div class="field">
        <label>科目（可选）</label>
        <div class="chips" id="todo-edit-subjects" role="group" aria-label="任务科目">
          <button class="chip${subjectId ? '' : ' on'}" type="button" data-edit-subject="" aria-pressed="${subjectId ? 'false' : 'true'}">不指定</button>
          ${subjects.map((s) => `<button class="chip${s.id === subjectId ? ' on' : ''}" type="button" data-edit-subject="${s.id}" aria-pressed="${s.id === subjectId ? 'true' : 'false'}">${s.emoji || '📘'} ${esc(s.name)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>预计时长（可选）</label>
        <div class="chips" id="todo-edit-minutes" role="group" aria-label="预计时长">
          ${minOptions.map((m) => `<button class="chip${m === minutes ? ' on' : ''}" type="button" data-edit-min="${m}" aria-pressed="${m === minutes ? 'true' : 'false'}">${m ? m + ' 分钟' : '不设'}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="todo-edit-date">日期</label>
        <input class="input" id="todo-edit-date" type="date" value="${item.occurrence}" />
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="no">取消</button>
        <button class="btn primary" type="button" data-act="yes">保存</button>
      </div>`,
      (sheet) => {
        const input = sheet.querySelector('#todo-edit-text');
        const dateEl = sheet.querySelector('#todo-edit-date');
        sheet.querySelectorAll('[data-edit-subject]').forEach((btn) => {
          btn.addEventListener('click', () => {
            subjectId = btn.dataset.editSubject || null;
            sheet.querySelectorAll('[data-edit-subject]').forEach((b) => {
              const on = b === btn;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
        });
        sheet.querySelectorAll('[data-edit-min]').forEach((btn) => {
          btn.addEventListener('click', () => {
            minutes = Number(btn.dataset.editMin) || 0;
            sheet.querySelectorAll('[data-edit-min]').forEach((b) => {
              const on = b === btn;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
        });
        sheet.querySelector('[data-act="no"]').addEventListener('click', () => finish(null));
        sheet.querySelector('[data-act="yes"]').addEventListener('click', () => {
          const text = input.value.trim();
          if (!text) { input.focus(); return; }
          const dateKeyVal = /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value) ? dateEl.value : item.occurrence;
          finish({ text, subjectId, minutes, dateKey: dateKeyVal });
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); sheet.querySelector('[data-act="yes"]').click(); }
        });
        setTimeout(() => input.focus(), 150);
      },
    );
  });
}

/* 按当前筛选、搜索词与科目收集任务；重复任务按天投影，逾期只算不重复的任务 */
function collect(filter, q, subjectId) {
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
  if (subjectId) list = list.filter((t) => t.subjectId === subjectId);
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
  const editHtml = '<button class="todo-more" type="button" data-act="edit" title="编辑任务" aria-label="编辑任务">⋯</button>';
  return '<div class="plan-task todo-task' + (t.done ? ' done' : '') + (isOverdue ? ' is-overdue' : '') + '" data-occ="' + t.occurrence + '" data-id="' + t.id + '" data-repeat="' + normRepeat(t.repeat) + '">'
    + '<button class="plan-check" type="button" data-act="toggle" aria-label="' + (t.done ? '标记未完成' : '标记完成') + '">' + (t.done ? '✓' : '○') + '</button>'
    + '<div class="plan-text"><span class="plan-title">' + esc(t.text) + '</span>' + subjectHtml + '</div>'
    + durationHtml
    + repeatHtml
    + reschedHtml
    + editHtml
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
  let subjectId = '';
  let bodyEl = null;
  let countEl = null;
  let selectMode = false;
  const selected = new Set();
  let batchBar = null;
  let batchBtn = null;

  const overview = todoOverview();
  const subjects = activeSubjects();
  const subjectChips = subjects.length
    ? '<div class="chips todo-subjects fade-in" id="todo-subjects" role="group" aria-label="按科目筛选">'
      + '<button class="chip on" type="button" data-subject="" aria-pressed="true">全部科目</button>'
      + subjects.map((s) => '<button class="chip" type="button" data-subject="' + s.id + '" aria-pressed="false">' + (s.emoji || '📘') + ' ' + esc(s.name) + '</button>').join('')
      + '</div>'
    : '';
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
    + subjectChips
    + '<div class="todo-toolbar fade-in"><p class="hint" id="todo-count" aria-live="polite"></p>'
    + '<div class="todo-tools">'
    + (overview.overdue ? '<button class="chip todo-snooze-all" type="button" data-act="snooze-all">顺延全部逾期</button>' : '')
    + '<button class="chip todo-batch-btn" type="button" id="todo-batch" aria-pressed="false">批量</button>'
    + '<button class="btn primary todo-add" type="button" data-act="add">+ 添加任务</button>'
    + '</div></div>'
    + '<div id="todos-body"></div>'
    + '<div class="batch-bar todo-batch-bar" id="todo-batch-bar" hidden role="toolbar" aria-label="任务批量操作">'
    + '<button class="chip todo-batch-chip" type="button" id="todo-batch-all">全选</button>'
    + '<span class="batch-count" id="todo-batch-count" aria-live="polite">已选 0 项</span>'
    + '<button class="chip todo-batch-chip" type="button" id="todo-batch-complete" disabled>标完成</button>'
    + '<button class="chip todo-batch-chip" type="button" id="todo-batch-snooze" disabled>顺延</button>'
    + '<button class="chip todo-batch-chip batch-danger" type="button" id="todo-batch-del" disabled>删除</button>'
    + '<button class="chip todo-batch-chip" type="button" id="todo-batch-exit">退出</button>'
    + '</div>';

  function currentItems() {
    return collect(filter, q, subjectId);
  }

  function selectedItems() {
    const map = new Map(currentItems().map((t) => [occKey(t), t]));
    return Array.from(selected).map((k) => map.get(k)).filter(Boolean);
  }

  function syncBatchBar() {
    const count = document.getElementById('todo-batch-count');
    if (count) count.textContent = '已选 ' + selected.size + ' 项';
    ['todo-batch-complete', 'todo-batch-snooze', 'todo-batch-del'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !selected.size;
    });
  }

  function decorateSelect() {
    if (!bodyEl || !batchBar) return;
    bodyEl.classList.toggle('selecting', selectMode);
    batchBar.hidden = !selectMode;
    bodyEl.querySelectorAll('.todo-task').forEach((el) => {
      let pick = el.querySelector('.todo-pick');
      if (selectMode && !pick) {
        pick = document.createElement('span');
        pick.className = 'todo-pick';
        pick.setAttribute('aria-hidden', 'true');
        el.prepend(pick);
      }
      if (!selectMode && pick) pick.remove();
      el.classList.toggle('picked', selectMode && selected.has(el.dataset.id + '|' + el.dataset.occ));
    });
    syncBatchBar();
  }

  function enterSelect() {
    selectMode = true;
    selected.clear();
    if (batchBtn) batchBtn.setAttribute('aria-pressed', 'true');
    haptic();
    decorateSelect();
  }

  function exitSelect() {
    selectMode = false;
    selected.clear();
    if (batchBtn) batchBtn.setAttribute('aria-pressed', 'false');
    decorateSelect();
  }

  function batchComplete() {
    const items = selectedItems().filter((t) => !t.done);
    if (!items.length) { toast('选中的任务都已完成'); return; }
    const n = completeTodoOccurrences(items.map((t) => ({ id: t.id, date: t.occurrence })));
    exitSelect();
    paint();
    toast('已标记完成 ' + n + ' 项');
  }

  function batchSnooze() {
    const items = selectedItems().filter((t) => !t.done && t.occurrence <= todayKey);
    if (!items.length) { toast('选中任务里没有需要顺延的逾期任务'); return; }
    const n = rescheduleTodoOccurrences(items.map((t) => ({ id: t.id, date: t.occurrence })), todayKey);
    exitSelect();
    paint();
    toast('已顺延 ' + n + ' 项到今天');
  }

  async function batchDelete() {
    const items = selectedItems();
    if (!items.length) return;
    const ok = await confirmSheet({
      title: '删除这 ' + items.length + ' 项任务？',
      desc: '重复任务只跳过选中的那一天，不会删除整个系列。',
      okText: '删除', danger: true,
    });
    if (!ok) return;
    const n = removeTodoOccurrences(items.map((t) => ({ id: t.id, date: t.occurrence })));
    exitSelect();
    paint();
    toast('已删除 ' + n + ' 项任务');
  }

  async function snoozeAllOverdue() {
    const items = overdueTodos(180).filter((t) => !t.done);
    if (!items.length) { toast('没有逾期任务'); return; }
    const ok = await confirmSheet({
      title: '顺延全部逾期任务？',
      desc: '把 ' + items.length + ' 项逾期任务移到今天；重复任务只调整逾期的那一天。',
      okText: '顺延',
    });
    if (!ok) return;
    const n = rescheduleTodoOccurrences(items.map((t) => ({ id: t.id, date: t.occurrence })), todayKey);
    paint();
    toast('已顺延 ' + n + ' 项任务到今天');
  }

  function paint() {
    const list = collect(filter, q, subjectId);
    bodyEl.innerHTML = listHtml(list, filter, todayKey, tomorrowKey);
    countEl.textContent = filter === 'done'
      ? '共 ' + list.length + ' 项已完成'
      : filter === 'all' ? '共 ' + list.length + ' 项任务' : '共 ' + list.length + ' 项待办';
    decorateSelect();
  }

  function mount(root) {
    bodyEl = root.querySelector('#todos-body');
    countEl = root.querySelector('#todo-count');
    batchBar = root.querySelector('#todo-batch-bar');
    batchBtn = root.querySelector('#todo-batch');
    const leaveSelect = () => { if (selectMode) exitSelect(); };

    root.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        leaveSelect();
        filter = btn.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        paint();
      });
    });
    root.querySelectorAll('[data-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        leaveSelect();
        subjectId = btn.dataset.subject || '';
        root.querySelectorAll('[data-subject]').forEach((b) => {
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
      leaveSelect();
      q = input.value;
      clr.hidden = !q;
      paint();
    });
    clr.addEventListener('click', () => {
      leaveSelect();
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

    root.querySelector('#todo-batch').addEventListener('click', () => {
      if (selectMode) exitSelect(); else enterSelect();
    });
    root.querySelector('#todo-batch-all').addEventListener('click', () => {
      currentItems().forEach((t) => selected.add(occKey(t)));
      decorateSelect();
      haptic();
    });
    root.querySelector('#todo-batch-exit').addEventListener('click', () => exitSelect());
    root.querySelector('#todo-batch-complete').addEventListener('click', batchComplete);
    root.querySelector('#todo-batch-snooze').addEventListener('click', batchSnooze);
    root.querySelector('#todo-batch-del').addEventListener('click', batchDelete);
    const snoozeAll = root.querySelector('[data-act="snooze-all"]');
    if (snoozeAll) snoozeAll.addEventListener('click', snoozeAllOverdue);

    bodyEl.addEventListener('click', async (e) => {
      const row = e.target instanceof Element ? e.target.closest('[data-occ]') : null;
      if (!row) return;
      if (selectMode) {
        const k = row.dataset.id + '|' + row.dataset.occ;
        if (selected.has(k)) selected.delete(k); else selected.add(k);
        row.classList.toggle('picked', selected.has(k));
        syncBatchBar();
        haptic();
        return;
      }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = row.dataset.id;
      const key = row.dataset.occ;
      const rep = normRepeat(row.dataset.repeat);
      const act = btn.dataset.act;
      if (act === 'toggle') {
        haptic();
        toggleTodo(id, key);
      } else if (act === 'resched') {
        if (rescheduleTodo(id, todayKey)) toast('已顺延到今天');
      } else if (act === 'edit') {
        const item = taskOccurrences(key, key).find((x) => x.id === id);
        if (!item) return;
        haptic();
        const result = await openEditTodoSheet(item);
        if (!result) return;
        const updated = updateTodo(id, { text: result.text, subjectId: result.subjectId, minutes: result.minutes });
        if (!updated) { toast('任务保存失败'); return; }
        if (result.dateKey !== key && rescheduleTodoOccurrence(id, key, result.dateKey)) toast('任务已更新并改期');
        else toast('任务已更新');
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
