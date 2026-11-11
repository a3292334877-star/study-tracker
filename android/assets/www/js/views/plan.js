/* 学习计划：把任务排到一周的每一天（v1.17） */
import {
  planWeek, addTodo, toggleTodo, removeTodo, dateKey, addDays, parseKey,
} from '../store.js';
import {
  esc, fmtMinShort, weekdayCN, monthDayCN, promptSheet, toast, haptic,
} from '../util.js';

export function renderPlan(ctx) {
  const todayKey = dateKey(new Date());
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.week || '')) ? ctx.query.week : todayKey;
  const wk = planWeek(anchor);
  const startDate = parseKey(wk.startKey);
  const thisWeek = wk.startKey === planWeek(todayKey).startKey;
  const rangeText = `${monthDayCN(startDate)} – ${monthDayCN(parseKey(wk.endKey))}`;

  const html = `
    <section class="hero fade-in">
      <div class="hero-label">本周计划</div>
      <div class="hero-value"><b>${wk.done}</b><span>/ ${wk.total} 项</span></div>
      <div class="hero-sub">${rangeText}${wk.total ? ` · 完成率 ${wk.pct}%` : ' · 还没有安排任务'}</div>
      <div class="hero-bar"><i style="width:${wk.pct}%"></i></div>
      <div class="hero-foot">
        <span>本周已学习 ${fmtMinShort(wk.minutes)}</span>
        ${thisWeek ? '' : '<button type="button" data-act="this-week">回到本周 →</button>'}
      </div>
    </section>

    <div class="year-nav plan-nav fade-in" role="group" aria-label="切换周">
      <button class="year-btn" type="button" data-week-step="-1" aria-label="上一周">‹</button>
      <span class="year-label">${rangeText}</span>
      <button class="year-btn" type="button" data-week-step="1" aria-label="下一周">›</button>
    </div>

    ${wk.days.map((day) => `
      <section class="card plan-day fade-in${day.isToday ? ' is-today' : ''}" data-plan-day="${day.key}">
        <div class="plan-day-head">
          <div class="plan-day-title">
            <b>${weekdayCN(day.date)}</b>
            <span>${day.date.getMonth() + 1}/${day.date.getDate()}</span>
            ${day.isToday ? '<em>今天</em>' : ''}
          </div>
          <div class="plan-day-meta">${day.minutes ? `学习 ${fmtMinShort(day.minutes)} · ` : ''}${day.total ? `${day.done}/${day.total} 完成` : '无任务'}</div>
        </div>
        ${day.todos.length ? `<div class="plan-list">
          ${day.todos.map((t) => `
            <div class="plan-task${t.done ? ' done' : ''}" data-plan-task="${t.id}">
              <button class="plan-check" type="button" data-act="toggle-plan" aria-label="${t.done ? '标记未完成' : '标记完成'}">${t.done ? '✓' : '○'}</button>
              <div class="plan-text">${esc(t.text)}</div>
              <button class="row-chev" type="button" data-act="del-plan" aria-label="删除任务">✕</button>
            </div>`).join('')}
        </div>` : '<p class="plan-empty">没有安排任务</p>'}
        <button class="plan-add" type="button" data-add-day="${day.key}">+ 添加任务</button>
      </section>`).join('')}
  `;

  function mount(root) {
    root.querySelectorAll('[data-week-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = Number(btn.dataset.weekStep) || 0;
        if (!step) return;
        ctx.go('#/plan?week=' + dateKey(addDays(startDate, step * 7)));
      });
    });
    const thisBtn = root.querySelector('[data-act="this-week"]');
    if (thisBtn) thisBtn.addEventListener('click', () => ctx.go('#/plan'));
    root.querySelectorAll('[data-add-day]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.addDay;
        const d = parseKey(key);
        const text = await promptSheet({
          title: '添加任务',
          desc: `${monthDayCN(d)} ${weekdayCN(d)} 要做什么？`,
          placeholder: '例如：复习英语听力 30 分钟',
          maxlength: 40,
        });
        if (text) { addTodo(text, key); toast('任务已添加'); }
      });
    });
    root.querySelectorAll('[data-act="toggle-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic();
        toggleTodo(btn.closest('[data-plan-task]').dataset.planTask);
      });
    });
    root.querySelectorAll('[data-act="del-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeTodo(btn.closest('[data-plan-task]').dataset.planTask);
      });
    });
  }

  return { title: '学习计划', sub: '把这一周安排好', html, mount };
}