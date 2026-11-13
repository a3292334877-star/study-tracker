/* 今日视图：今天学了什么 + 今天的任务 */
import {
  getState, sessionsOfDay, minutesOfDay, streak, addTodo, toggleTodo, setTodoDone, removeTodo, lastNDays, todosOfDay, repeatLabel, getSubject, reviewStats, goalOverview, todoOverview,
} from '../store.js';
import {
  esc, fmtMin, fmtMinShort, dateKey, weekdayCN, monthDayCN, haptic,
  promptSheet, toast,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';
import { recordItem } from './log.js';

function todoMeta(t) {
  const subj = t.subjectId ? getSubject(t.subjectId) : null;
  return [
    repeatLabel(t.repeat) ? repeatLabel(t.repeat) + '重复' : '',
    subj ? (subj.emoji || '📘') + ' ' + esc(subj.name) : '',
    t.minutes ? '预计 ' + fmtMinShort(t.minutes) : '',
  ].filter(Boolean).join(' · ');
}

export function renderHome(ctx) {
  const state = getState();
  const now = new Date();
  const todayKey = dateKey(now);
  const todayMin = minutesOfDay(todayKey);
  const goal = Math.max(30, Number(state.settings.dailyGoalMin) || 120);
  const pct = Math.min(100, Math.round((todayMin / goal) * 100));
  const sessions = sessionsOfDay(todayKey);
  const week = lastNDays(7);
  const weekMin = week.reduce((s, d) => s + d.minutes, 0);
  const streakDays = streak();
  const left = Math.max(0, goal - todayMin);
  const todos = todosOfDay(todayKey);
  const doneTodos = todos.filter((t) => t.done).length;
  const mem = reviewStats();
  const todoOv = todoOverview();
  const weeklyGoal = goalOverview().weekly;
  const weekGoalSub = weeklyGoal.target > 0
    ? `${fmtMinShort(weeklyGoal.actual)} / ${fmtMinShort(weeklyGoal.target)} · ${weeklyGoal.met ? '已达成' : '还差 ' + fmtMinShort(weeklyGoal.remaining)}`
    : '还没设目标 · 点此设置';

  const sub = `${weekdayCN(now)} · ${monthDayCN(now)}`;

  const html = `
    <section class="hero fade-in">
      <div class="hero-label">今日学习</div>
      <div class="hero-value"><b>${fmtMin(todayMin).value}</b><span>${fmtMin(todayMin).unit}</span></div>
      <div class="hero-sub">${sessions.length ? `${sessions.length} 条记录` : '今天还没有记录'} · 目标 ${fmtMinShort(goal)}${left > 0 ? ` · 还差 ${fmtMinShort(left)}` : ' · 已达成'}</div>
      <div class="hero-bar"><i style="width:${pct}%"></i></div>
      <div class="hero-foot">
        <span>完成度 ${pct}%</span>
        <button type="button" data-add-record>+ 记一笔 →</button>
      </div>
    </section>

    <div class="stat-grid fade-in">
      <div class="stat"><b>${streakDays}<small>天</small></b><span>连续记录</span></div>
      <div class="stat"><b>${fmtMin(weekMin).value}<small>${fmtMin(weekMin).unit}</small></b><span>近 7 天</span></div>
      <div class="stat"><b>${sessions.length}<small>条</small></b><span>今日记录</span></div>
    </div>

    <section class="card fade-in goal-entry" style="padding:0">
      <button class="row" type="button" data-go-goals style="padding:14px 16px">
        <div class="row-ic" style="background:var(--primary-soft);color:var(--primary)">🏁</div>
        <div class="row-main">
          <div class="row-title">本周目标</div>
          <div class="row-sub">${weekGoalSub}</div>
        </div>
        <div class="row-val" style="color:var(--primary)">${weeklyGoal.target > 0 ? weeklyGoal.pct + '%' : '›'}</div>
      </button>
    </section>

    <section class="card fade-in memory-entry" style="padding:0">
      <button class="row" type="button" data-go-memory style="padding:14px 16px">
        <div class="row-ic" style="background:var(--primary-soft);color:var(--primary)">🔁</div>
        <div class="row-main">
          <div class="row-title">笔记回顾</div>
          <div class="row-sub">${mem.due ? `${mem.due} 条笔记今天该回顾` : (mem.totalNotes ? '今天的回顾已完成，明天再来' : '记录时写心得，之后自动按间隔复习')}</div>
        </div>
        <div class="row-val" style="color:${mem.due ? 'var(--primary)' : 'var(--text-3)'}">${mem.due ? mem.due + ' 条' : '›'}</div>
      </button>
    </section>

    ${todoOv.overdue ? `<section class="card fade-in todo-entry" style="padding:0">
      <button class="row" type="button" data-go-todos style="padding:14px 16px">
        <div class="row-ic" style="background:color-mix(in srgb, var(--danger) 12%, transparent);color:var(--danger)">⏰</div>
        <div class="row-main">
          <div class="row-title">有 ${todoOv.overdue} 项任务逾期了</div>
          <div class="row-sub">去任务中心看看，可以一键顺延到今天</div>
        </div>
        <div class="row-val" style="color:var(--danger)">处理 ›</div>
      </button>
    </section>` : ''}

    <section class="fade-in" style="margin-bottom:4px">
      <div class="card-title" style="padding:0 6px">
        <h3>今天学了什么</h3>
        <button class="more" type="button" data-add-record>+ 记一笔</button>
      </div>
      ${sessions.length ? `<div class="tl-card" style="padding:4px 6px">
        ${sessions.map((s) => recordItem(s)).join('')}
      </div>` : `
      <div class="card">
        <div class="empty" style="padding:26px 18px">
          <span class="em">📖</span>
          <p>今天还没有记录<br/>学了什么，随手写一句就行</p>
          <button class="btn primary" type="button" data-add-record>记一笔</button>
        </div>
      </div>`}
    </section>

    <section class="card fade-in">
      <div class="card-title">
        <h3>今日任务${todos.length ? ` <span style="font-size:12px;color:var(--text-3);font-weight:600">${doneTodos}/${todos.length}</span>` : ''}</h3>
        <span style="display:flex;gap:12px;align-items:center">
          <button class="more" type="button" data-act="plan">本周计划 ›</button>
          <button class="more" type="button" data-act="add-todo">+ 添加</button>
        </span>
      </div>
      <div class="list" id="todo-list">
        ${todos.length ? todos.map((t) => `
          <div class="row" data-todo="${t.id}" data-date="${t.occurrence || todayKey}" data-repeat="${t.repeat || 'none'}">
            <button class="row-ic" type="button" data-act="toggle-todo" style="background:${t.done ? 'var(--primary-soft)' : 'var(--surface-2)'};color:${t.done ? 'var(--primary)' : 'var(--text-3)'}">
              ${t.done ? '✓' : '○'}
            </button>
            <div class="row-main">
              <div class="row-title" style="${t.done ? 'color:var(--text-3);text-decoration:line-through' : ''}">${esc(t.text)}</div>
              ${todoMeta(t) ? `<div class="row-sub">${todoMeta(t)}</div>` : ''}
            </div>
            <button class="row-chev task-record" type="button" data-act="record-todo" aria-label="记一笔" title="记一笔">✎</button>
            <button class="row-chev" type="button" data-act="del-todo" aria-label="删除">✕</button>
          </div>`).join('') : `
          <div class="empty" style="padding:18px 0"><p>还没有任务，添加一件今天要做的事吧</p></div>`}
      </div>
    </section>
  `;

  function mount(root) {
    root.querySelectorAll('[data-add-record]').forEach((el) => {
      el.addEventListener('click', () => {
        haptic();
        openRecordSheet({ onChange: () => ctx.refresh() });
      });
    });
    const memBtn = root.querySelector('[data-go-memory]');
    if (memBtn) memBtn.addEventListener('click', () => { haptic(); ctx.go('#/memory'); });
    const goalBtn = root.querySelector('[data-go-goals]');
    if (goalBtn) goalBtn.addEventListener('click', () => { haptic(); ctx.go('#/goals'); });
    const todosEntry = root.querySelector('[data-go-todos]');
    if (todosEntry) todosEntry.addEventListener('click', () => { haptic(); ctx.go('#/todos'); });
    root.querySelectorAll('[data-act="record-todo"]').forEach((el) => {
      el.addEventListener('click', () => {
        const row = el.closest('[data-todo]');
        const key = row.dataset.date;
        const id = row.dataset.todo;
        const item = todosOfDay(key).find((x) => x.id === id);
        if (!item) return;
        haptic();
        openRecordSheet({
          initial: { title: item.text, subjectId: item.subjectId || undefined, dateKey: key },
          onChange: () => {
            setTodoDone(id, key, true);
            ctx.refresh();
            toast('已记一笔 · 任务完成 ✓');
          },
        });
      });
    });
    root.querySelectorAll('[data-act="toggle-todo"]').forEach((el) => {
      el.addEventListener('click', () => {
        haptic();
        const row = el.closest('[data-todo]');
        toggleTodo(row.dataset.todo, row.dataset.date);
        ctx.refresh();
      });
    });
    root.querySelectorAll('[data-act="del-todo"]').forEach((el) => {
      el.addEventListener('click', () => {
        const row = el.closest('[data-todo]');
        removeTodo(row.dataset.todo, row.dataset.date);
        ctx.refresh();
      });
    });
    const planBtn = root.querySelector('[data-act="plan"]');
    if (planBtn) planBtn.addEventListener('click', () => ctx.go('#/plan'));
    const addBtn = root.querySelector('[data-act="add-todo"]');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const text = await promptSheet({
          title: '添加任务', desc: '今天想完成什么？', placeholder: '例如：数学第三章习题', maxlength: 40,
        });
        if (text) { addTodo(text, todayKey); ctx.refresh(); toast('任务已添加'); }
      });
    }
    root.querySelectorAll('[data-session]').forEach((row) => {
      row.addEventListener('click', () => openRecordSheet({ id: row.dataset.session, onChange: () => ctx.refresh() }));
    });
  }

  return { title: '今日', sub, html, mount };
}
