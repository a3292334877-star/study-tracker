/* 今日视图：今天学了什么 + 今天的任务 */
import {
  getState, sessionsOfDay, minutesOfDay, streak, addTodo, toggleTodo, removeTodo, lastNDays, todosOfDay,
} from '../store.js';
import {
  esc, fmtMin, fmtMinShort, dateKey, weekdayCN, monthDayCN, haptic,
  promptSheet, toast,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';
import { recordItem } from './log.js';

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
          <div class="row" data-todo="${t.id}">
            <button class="row-ic" type="button" data-act="toggle-todo" style="background:${t.done ? 'var(--primary-soft)' : 'var(--surface-2)'};color:${t.done ? 'var(--primary)' : 'var(--text-3)'}">
              ${t.done ? '✓' : '○'}
            </button>
            <div class="row-main">
              <div class="row-title" style="${t.done ? 'color:var(--text-3);text-decoration:line-through' : ''}">${esc(t.text)}</div>
            </div>
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
    root.querySelectorAll('[data-act="toggle-todo"]').forEach((el) => {
      el.addEventListener('click', () => {
        haptic();
        toggleTodo(el.closest('[data-todo]').dataset.todo);
        ctx.refresh();
      });
    });
    root.querySelectorAll('[data-act="del-todo"]').forEach((el) => {
      el.addEventListener('click', () => {
        removeTodo(el.closest('[data-todo]').dataset.todo);
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
