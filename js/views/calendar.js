/* 学习日历（v1.16）：把一年 12 个月铺成可点的日历，回看/补记每一天 */
import { calendarYear, getState } from '../store.js';
import { fmtMin, fmtMinShort, monthDayCN, parseKey, haptic } from '../util.js';
import { openDaySheet } from '../sheets.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function weekHead(weekStart) {
  return Array.from({ length: 7 }, (_, i) => WEEK[(weekStart + i) % 7]);
}

export function renderCalendar(ctx) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const asked = Number(ctx.query.year);
  const year = Number.isFinite(asked) && asked > 0
    ? Math.min(currentYear, Math.max(2000, Math.round(asked)))
    : currentYear;
  const d = calendarYear(year);
  const weekStart = Number(getState().settings.weekStart) || 1;
  const total = fmtMin(d.totalMin);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const bestText = d.bestDay ? monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.min) : '—';
  const bestMonth = d.bestMonth >= 0 ? (d.bestMonth + 1) + ' 月' : '—';
  const prevDisabled = year <= 2000;
  const nextDisabled = year >= currentYear;

  const monthCards = d.months.map((m) => {
    const first = new Date(year, m.month - 1, 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<span class="cal-cell cal-blank" aria-hidden="true"></span>');
    m.days.forEach((day) => {
      const future = day.key > todayKey;
      const isToday = day.key === todayKey;
      const label = day.key + (day.minutes ? ' · ' + fmtMinShort(day.minutes) : ' · 没有记录');
      cells.push('<button type="button" class="cal-cell lv' + day.level + (isToday ? ' today' : '') + '" data-day="' + day.key + '" title="' + label + '" aria-label="' + label + '"' + (future ? ' disabled' : '') + '>' + day.day + '</button>');
    });
    return '<section class="cal-month fade-in' + (year === currentYear && m.month === now.getMonth() + 1 ? ' is-now' : '') + '" data-month="' + m.month + '">' +
      '<div class="cal-month-head"><span class="cal-month-name">' + m.label + '</span><span class="cal-month-total">' + (m.totalMin ? fmtMinShort(m.totalMin) : '—') + '</span></div>' +
      '<div class="cal-week" aria-hidden="true">' + weekHead(weekStart).map((w) => '<span>' + w + '</span>').join('') + '</div>' +
      '<div class="cal-grid" role="group" aria-label="' + year + ' 年 ' + m.label + '">' + cells.join('') + '</div>' +
    '</section>';
  }).join('');

  const html = `
    <div class="year-nav fade-in">
      <button class="year-btn" type="button" data-year-step="-1" aria-label="上一年"${prevDisabled ? ' disabled' : ''}>‹</button>
      <div class="year-label"><b id="cal-year">${year}</b><span>学习日历</span></div>
      <button class="year-btn" type="button" data-year-step="1" aria-label="下一年"${nextDisabled ? ' disabled' : ''}>›</button>
    </div>

    <section class="hero fade-in" style="margin-top:12px">
      <div class="hero-label">${year} 年累计学习</div>
      <div class="hero-value" id="cal-total" aria-live="polite"><b>${total.value}</b><span>${total.unit}</span></div>
      <div class="hero-sub" id="cal-sub">${d.count} 条记录 · ${d.activeDays} 天有记录 · 最长连续 ${d.longest} 天</div>
    </section>

    <div class="cal-facts fade-in" id="cal-facts">
      <div class="cal-fact"><b id="cal-days">${d.activeDays}</b><span>学习天数</span></div>
      <div class="cal-fact"><b id="cal-count">${d.count}</b><span>记录条数</span></div>
      <div class="cal-fact"><b>${bestMonth}</b><span>最活跃月份</span></div>
    </div>

    <section class="card cal-card fade-in">
      <div class="card-title"><h3>每一天</h3><span class="more">最佳单日 · ${bestText}</span></div>
      <p class="hint cal-hint">颜色越深，那天学得越久。点任意一天可以查看当天记录，也可以补记。</p>
      ${d.count ? '' : '<p class="cal-empty" id="cal-empty">这一年还没有学习记录，点任意一天可以补记。</p>'}
      <div class="cal-months" id="cal-months">${monthCards}</div>
      <div class="cal-legend" aria-hidden="true"><span>少</span>
        ${[0.06, 0.28, 0.48, 0.72, 1].map((a) => '<i style="background:color-mix(in srgb,var(--primary) ' + Math.round(a * 100) + '%,var(--surface-2))"></i>').join('')}
        <span>多</span>
      </div>
    </section>
  `;

  function mount(root) {
    root.querySelectorAll('[data-year-step]').forEach((b) => {
      b.addEventListener('click', () => {
        const next = Math.min(currentYear, Math.max(2000, year + Number(b.dataset.yearStep)));
        if (next === year) return;
        haptic();
        ctx.go('#/calendar?year=' + next);
      });
    });
    root.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        haptic();
        openDaySheet(btn.dataset.day, () => ctx.refresh());
      });
    });
  }

  return { title: '学习日历', sub: '按天回看自己的积累', html, mount };
}
