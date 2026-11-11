/* 统计视图：学了多久、学了什么、坚持了几天 */
import {
  getState, lastNDays, getSubject, streak,
  rangeSummary, bestDay, longestStreak, allSessions,
} from '../store.js';
import {
  esc, fmtMin, fmtMinShort, dateKey, addDays, startOfWeek, parseKey, monthDayCN,
  openSheet, closeSheet, toast, haptic,
} from '../util.js';
import { openDaySheet, openRecordSheet } from '../sheets.js';
import { recordItem } from './log.js';
import {
  weekData, weeklyText, drawWeeklyPoster, posterFilename, drawStreakCard, streakFilename,
} from '../report.js';

const RANGES = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

/* v1.7：把小时数归到口语化的时段 */
function hourBandText(h) {
  if (h < 5) return '凌晨';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

function rangeKeys(range, weekStart) {
  const now = new Date();
  if (range === 'week') {
    const start = startOfWeek(now, weekStart);
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => dateKey(addDays(start, i)));
  }
  const sessions = getState().sessions;
  if (!sessions.length) return [dateKey(now)];
  const first = new Date(Math.min(...sessions.map((s) => s.start)));
  const total = Math.min(120, Math.max(1, Math.ceil((now - first) / 86400000) + 1));
  return Array.from({ length: total }, (_, i) => dateKey(addDays(first, i)));
}

/* 对比口径：本周 vs 上周（按 weekStart）、本月 vs 上月、全部 vs 最近 30 天 / 此前 30 天 */
function compareOf(range, weekStart) {
  const now = new Date();
  let curLabel = '本周';
  let prevLabel = '上周';
  let curFrom;
  let curTo;
  let prevFrom;
  let prevTo;

  if (range === 'month') {
    curLabel = '本月';
    prevLabel = '上月';
    curFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    curTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevTo = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (range === 'all') {
    curLabel = '最近 30 天';
    prevLabel = '此前 30 天';
    curFrom = addDays(now, -29);
    curTo = now;
    prevFrom = addDays(now, -59);
    prevTo = addDays(now, -30);
  } else {
    const start = startOfWeek(now, weekStart);
    curFrom = start;
    curTo = addDays(start, 6);
    prevFrom = addDays(start, -7);
    prevTo = addDays(start, -1);
  }

  const cur = rangeSummary(dateKey(curFrom), dateKey(curTo)).minutes;
  const prev = rangeSummary(dateKey(prevFrom), dateKey(prevTo)).minutes;

  /* 上一周期没有记录时不给百分比（避免除以 0），数值位直接显示「无记录」 */
  const prevText = prev > 0 ? fmtMinShort(prev) : '无记录';
  const showDelta = prev > 0;
  let deltaText = '';
  let deltaKind = 'flat';
  if (showDelta) {
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) {
      deltaText = `与${prevLabel}持平`;
    } else if (pct > 0) {
      deltaText = `↑ ${pct}%`;
      deltaKind = 'up';
    } else {
      deltaText = `↓ ${Math.abs(pct)}%`;
      deltaKind = 'down';
    }
  }
  return { curLabel, prevLabel, cur, prev, prevText, showDelta, deltaText, deltaKind };
}

export function renderStats(ctx) {
  const state = getState();
  const range = ctx.query.range || 'week';
  const weekStart = state.settings.weekStart ?? 1;
  const keys = rangeKeys(range, weekStart);
  const keySet = new Set(keys);

  const inRange = state.sessions.filter((s) => keySet.has(dateKey(new Date(s.end))));
  const totalMin = inRange.reduce((sum, s) => sum + s.minutes, 0);
  const activeDays = new Set(inRange.map((s) => dateKey(new Date(s.end)))).size;
  const avg = activeDays ? Math.round(totalMin / activeDays) : 0;
  const streakDays = streak();
  const perDay = activeDays ? (inRange.length / activeDays) : 0;

  /* 按科目聚合：时长 + 记录条数 */
  const bySubject = new Map();
  inRange.forEach((s) => {
    const id = s.subjectId || '__none';
    const cur = bySubject.get(id) || { min: 0, count: 0 };
    cur.min += s.minutes;
    cur.count += 1;
    bySubject.set(id, cur);
  });
  const subjectRows = [...bySubject.entries()]
    .map(([id, v]) => {
      const subject = getSubject(id);
      return {
        id,
        name: subject?.name || '未分类',
        color: subject?.color || '#98a0b3',
        emoji: subject?.emoji || '📘',
        min: v.min,
        count: v.count,
      };
    })
    .sort((a, b) => b.min - a.min || b.count - a.count);
  const maxSubject = Math.max(1, ...subjectRows.map((r) => r.min));

  /* v1.10：标签分布（跟随当前筛选范围，按累计时长排序，最多 8 个） */
  const tagMap = new Map();
  inRange.forEach((s) => {
    (Array.isArray(s.tags) ? s.tags : []).forEach((t) => {
      const row = tagMap.get(t) || { tag: t, count: 0, minutes: 0 };
      row.count += 1;
      row.minutes += s.minutes || 0;
      tagMap.set(t, row);
    });
  });
  const tagRows = [...tagMap.values()]
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count || (a.tag < b.tag ? -1 : 1))
    .slice(0, 8);
  const tagMax = Math.max(1, ...tagRows.map((r) => r.minutes || r.count));

  /* 本周目标进度（仅周视图展示） */
  const weekInfo = weekData(weekStart);
  const weekGoalRows = weekInfo.subjects
    .filter((s) => s.goalMinWeek > 0)
    .map((s) => ({
      ...s,
      pct: Math.min(100, Math.round((s.min / s.goalMinWeek) * 100)),
    }));
  const weekGoalDone = weekGoalRows.filter((g) => g.min >= g.goalMinWeek).length;

  /* 图表：本周按「本周一到周日」，其余按最近若干天 */
  const minByKey = new Map();
  state.sessions.forEach((s) => {
    const k = dateKey(new Date(s.end));
    minByKey.set(k, (minByKey.get(k) || 0) + s.minutes);
  });
  const chartDays = range === 'week'
    ? keys.map((k) => ({ key: k, date: parseKey(k), minutes: minByKey.get(k) || 0 }))
    : lastNDays(14);   // 月/全部：只画最近 14 天，避免 28 根柱在 390px 下横向溢出
  const maxChart = Math.max(30, ...chartDays.map((d) => d.minutes));
  const todayKey = dateKey(new Date());

  const total = fmtMin(totalMin);
  const recent = inRange.slice().sort((a, b) => b.end - a.end).slice(0, 5);

  /* v1.4：周/月/全部 的环比对比（口径见 compareOf） */
  const cmp = compareOf(range, weekStart);

  /* v1.4：历史最好成绩（与当前时间段无关） */
  const longestDays = longestStreak();
  const bestInfo = bestDay();
  const bestDateText = bestInfo ? monthDayCN(parseKey(bestInfo.key)) : '—';
  const bestMinText = bestInfo ? fmtMinShort(bestInfo.minutes) : '';
  const allMin = allSessions().reduce((sum, s) => sum + s.minutes, 0);

  /* v1.7：最近 28 天科目趋势（折线取最活跃的 4 个科目） */
  const TREND_N = 28;
  const trendDays = lastNDays(TREND_N);
  const trendStart = trendDays[0].key;
  const trendBySubject = new Map();   // subjectId -> Map(dayKey -> minutes)
  const trendTotals = new Map();      // subjectId -> total minutes
  state.sessions.forEach((s) => {
    const k = dateKey(new Date(s.end));
    if (k < trendStart) return;
    const id = s.subjectId || '__none';
    if (!trendBySubject.has(id)) { trendBySubject.set(id, new Map()); trendTotals.set(id, 0); }
    const dayMap = trendBySubject.get(id);
    dayMap.set(k, (dayMap.get(k) || 0) + s.minutes);
    trendTotals.set(id, trendTotals.get(id) + s.minutes);
  });
  const trendSeries = [...trendTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => {
      const subject = getSubject(id);
      const dayMap = trendBySubject.get(id);
      return {
        name: subject?.name || '未分类',
        color: subject?.color || '#98a0b3',
        emoji: subject?.emoji || '📘',
        points: trendDays.map((d) => dayMap.get(d.key) || 0),
      };
    });
  const trendDayTotals = trendDays.map((d) => {
    let sum = 0;
    trendBySubject.forEach((m) => { sum += m.get(d.key) || 0; });
    return sum;
  });
  const trendMaxDay = Math.max(30, ...trendDayTotals);
  const trendChart = { days: trendDays, max: trendMaxDay, series: trendSeries };

  /* v1.7：学习时段分布（按记录开始时间，跟随当前筛选范围） */
  const hourBars = Array.from({ length: 24 }, () => 0);
  inRange.forEach((s) => {
    hourBars[new Date(s.start).getHours()] += s.minutes;
  });
  const hourMax = Math.max(30, ...hourBars);
  let peakHour = -1;
  hourBars.forEach((m, h) => { if (m > 0 && (peakHour < 0 || m > hourBars[peakHour])) peakHour = h; });

  /* v1.7：周目标达成历史（最近 8 周，每周达成目标的科目占比） */
  const goalSubjects = state.subjects.filter((s) => (s.goalMinWeek || 0) > 0);
  const goalHistory = goalSubjects.length ? Array.from({ length: 8 }, (_, i) => {
    const ws = addDays(startOfWeek(new Date(), weekStart), -7 * (7 - i));
    const from = dateKey(ws);
    const to = dateKey(addDays(ws, 6));
    const per = new Map();
    state.sessions.forEach((s) => {
      const k = dateKey(new Date(s.end));
      if (k < from || k > to) return;
      const id = s.subjectId || '__none';
      per.set(id, (per.get(id) || 0) + s.minutes);
    });
    const met = goalSubjects.filter((g) => (per.get(g.id) || 0) >= g.goalMinWeek).length;
    return { from, met, total: goalSubjects.length, pct: Math.round((met / goalSubjects.length) * 100), isNow: i === 7 };
  }) : [];

  const html = `
    <div class="seg fade-in" id="range-seg">
      ${RANGES.map((r) => `<button type="button" data-range="${r.key}" class="${r.key === range ? 'on' : ''}">${r.label}</button>`).join('')}
    </div>

    <section class="hero fade-in" style="margin-top:12px">
      <div class="hero-label">${RANGES.find((r) => r.key === range)?.label}学习</div>
      <div class="hero-value" aria-live="polite"><b>${total.value}</b><span>${total.unit}</span></div>
      <div class="hero-sub">${inRange.length} 条记录 · ${activeDays} 天 · 平均每学 ${fmtMinShort(avg)}</div>
    </section>

    <div class="stats-cmp fade-in" role="group" aria-label="${cmp.curLabel}与${cmp.prevLabel}对比">
      <p class="stats-cmp-line" aria-live="polite">
        <span class="stats-cmp-item"><span class="stats-cmp-k">${cmp.curLabel}</span><b class="stats-cmp-v">${fmtMinShort(cmp.cur)}</b></span>
        <span class="stats-cmp-dot" aria-hidden="true">·</span>
        <span class="stats-cmp-item"><span class="stats-cmp-k">${cmp.prevLabel}</span><b class="stats-cmp-v${cmp.showDelta ? '' : ' stats-cmp-v-muted'}">${cmp.prevText}</b></span>
        ${cmp.showDelta ? `<span class="stats-cmp-dot" aria-hidden="true">·</span><span class="stats-cmp-delta stats-cmp-${cmp.deltaKind}">${cmp.deltaText}</span>` : ''}
      </p>
    </div>

    <div class="stat-grid fade-in">
      <div class="stat"><b>${streakDays}<small>天</small></b><span>连续记录</span></div>
      <div class="stat"><b>${inRange.length}<small>条</small></b><span>学习记录</span></div>
      <div class="stat"><b>${activeDays}<small>天</small></b><span>学习天数</span></div>
    </div>

    <div class="stat-grid stats-grid-2 fade-in">
      <div class="stat"><b>${longestDays}<small>天</small></b><span>最长连续</span></div>
      <div class="stat"><b>${bestDateText}</b><span>最佳单日${bestMinText ? ' · ' + bestMinText : ''}</span></div>
    </div>

    <section class="card fade-in">
      <div class="card-title"><h3>每日趋势</h3><span class="more">${range === 'week' ? '本周' : '最近 ' + chartDays.length + ' 天'} · 点柱看当天</span></div>
      <div class="chart">
        ${chartDays.map((d) => {
          const h = Math.max(4, Math.round((d.minutes / maxChart) * 100));
          const isToday = d.key === todayKey;
          return `<button class="chart-col" type="button" data-day="${d.key}" title="${d.key} · ${fmtMinShort(d.minutes)}">
            <div class="chart-bar${d.minutes ? ' has' : ''}${isToday ? ' today' : ''}" style="height:${h}%"></div>
            <div class="chart-lbl${isToday ? ' on' : ''}">${d.date.getDate()}</div>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>科目分布</h3></div>
      ${subjectRows.length ? `<div class="bars">
        ${subjectRows.map((r) => `<div class="bar-line">
          <span class="name"><span style="opacity:.85">${r.emoji}</span> ${esc(r.name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.round((r.min / maxSubject) * 100))}%;background:${r.color}"></div></div>
          <span class="bar-val">${r.min ? fmtMinShort(r.min) : `${r.count} 条`}</span>
        </div>`).join('')}
      </div>` : `<div class="empty"><span class="em">📊</span><p>这个时间段还没有记录</p></div>`}
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>标签分布</h3><span class="more">按标签看时间去向</span></div>
      ${tagRows.length ? `<div class="bars">
        ${tagRows.map((r) => `<div class="bar-line">
          <span class="name">#${esc(r.tag)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.round(((r.minutes || r.count) / tagMax) * 100))}%;background:#7d5cff"></div></div>
          <span class="bar-val">${r.minutes ? fmtMinShort(r.minutes) : r.count + ' 条'}</span>
        </div>`).join('')}
      </div>` : `<div class="empty"><span class="em">🏷️</span><p>这个时间段还没有用过标签</p></div>`}
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>科目趋势</h3><span class="more">最近 ${TREND_N} 天</span></div>
      ${trendSeries.length ? `
      <canvas id="trend-canvas" style="width:100%;height:190px;display:block" role="img" aria-label="最近 28 天各科目每日学习时长折线图"></canvas>
      <div class="trend-legend">${trendSeries.map((sr) => `<span class="trend-legend-item"><span class="trend-dot" style="background:${sr.color}"></span>${sr.emoji} ${esc(sr.name)}</span>`).join('')}</div>
      <p class="hint mt12">只画最近 ${TREND_N} 天最活跃的 ${trendSeries.length} 个科目 · 纵轴是当天总时长</p>`
      : `<div class="empty"><span class="em">📉</span><p>最近 ${TREND_N} 天还没有记录</p></div>`}
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>时段分布</h3><span class="more">${RANGES.find((r) => r.key === range)?.label} · 按开始时间</span></div>
      ${inRange.length ? `
      <div class="chart chart-hours">
        ${hourBars.map((m, h) => {
          const pct = Math.max(m ? 4 : 2, Math.round((m / hourMax) * 100));
          const lbl = [0, 6, 12, 18, 23].includes(h) ? String(h) : '';
          return `<div class="chart-col" title="${h} 点 · ${fmtMinShort(m)}">
            <div class="chart-bar${m ? ' has' : ''}" style="height:${pct}%"></div>
            <div class="chart-lbl${h === peakHour ? ' on' : ''}">${lbl}</div>
          </div>`;
        }).join('')}
      </div>
      <p class="hint mt12">${peakHour >= 0 ? `最常开始学习的时段：${hourBandText(peakHour)}（${peakHour} 点前后）` : '还没有可分析的记录'}</p>`
      : `<div class="empty"><span class="em">🕒</span><p>这个时间段还没有记录</p></div>`}
    </section>

    ${range === 'week' && weekGoalRows.length ? `
    <section class="card fade-in">
      <div class="card-title"><h3>本周目标</h3><span class="more">${weekGoalDone}/${weekGoalRows.length} 达成</span></div>
      <div class="bars">
        ${weekGoalRows.map((g) => `<div class="bar-line" data-goal="${g.id}" style="cursor:pointer">
          <span class="name"><span style="opacity:.85">${g.emoji}</span> ${esc(g.name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, g.pct)}%;background:${g.pct >= 100 ? 'var(--success, #12b76a)' : g.color}"></div></div>
          <span class="bar-val" style="color:${g.pct >= 100 ? 'var(--success, #12b76a)' : 'var(--text-3)'}">${g.pct}%</span>
        </div>`).join('')}
      </div>
      <p class="hint mt12">本周学习 / 每周目标（在科目编辑里设置）· 点击科目可调整</p>
    </section>` : ''}

    ${goalHistory.length ? `
    <section class="card fade-in">
      <div class="card-title"><h3>周目标达成</h3><span class="more">最近 8 周 · ${goalSubjects.length} 个科目有目标</span></div>
      <div class="chart chart-goalhist">
        ${goalHistory.map((w) => `<div class="chart-col" title="${w.from} 那周 · 达成 ${w.met}/${w.total}">
          <div class="chart-bar${w.pct >= 100 ? ' has' : ''}${w.isNow ? ' today' : ''}" style="height:${Math.max(3, w.pct)}%"></div>
          <div class="chart-lbl${w.isNow ? ' on' : ''}">${w.isNow ? '本周' : parseKey(w.from).getDate()}</div>
        </div>`).join('')}
      </div>
      <p class="hint mt12">每周达成周目标的科目占比 · 目标在科目编辑里设置</p>
    </section>` : ''}

    ${range === 'week' ? `
    <section class="card fade-in" id="report-card">
      <div class="card-title"><h3>学习周报</h3><span class="more">${weekInfo.rangeText}</span></div>
      <p class="hint" style="margin:0 0 14px">把这一周的坚持变成一张可以分享的卡片。</p>
      <div style="display:flex;gap:10px">
        <button class="btn primary" type="button" data-act="report-poster" style="flex:1">🖼️ 生成海报</button>
        <button class="btn" type="button" data-act="report-text" style="flex:1">📋 复制文字</button>
      </div>
    </section>` : ''}

    <section class="card fade-in" id="streak-card-card">
      <div class="card-title"><h3>连续打卡</h3><span class="more">${streakDays} 天</span></div>
      <p class="hint" style="margin:0 0 14px">把连续坚持的天数做成一张卡片，发给未来的自己。</p>
      <button class="btn primary block" type="button" data-act="streak-card" aria-label="生成连续打卡分享卡">🎴 打卡卡</button>
    </section>

    <section class="card fade-in" id="year-review-card">
      <div class="card-title"><h3>年度回顾</h3><span class="more">${new Date().getFullYear()} 年</span></div>
      <p class="hint" style="margin:0 0 14px">把一整年的学习叠成一份总结，还能存成年度海报。</p>
      <button class="btn block" type="button" data-act="year-review">🗓️ 查看年度回顾</button>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>最近记录</h3><span class="more">${activeDays ? `平均每学 ${perDay.toFixed(1)} 条` : ''}</span></div>
      ${recent.length ? recent.map((s) => recordItem(s, { showDate: true })).join('') : `<div class="empty"><span class="em">📖</span><p>还没有学习记录</p></div>`}
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>记录热力</h3><span class="more">最近 8 周</span></div>
      ${heatmap(weekStart)}
    </section>
  `;

  function mount(root) {
    root.querySelectorAll('[data-range]').forEach((b) => {
      b.addEventListener('click', () => { ctx.go('#/stats?range=' + b.dataset.range); });
    });
    root.querySelectorAll('[data-day]').forEach((b) => {
      b.addEventListener('click', () => openDaySheet(b.dataset.day, () => ctx.refresh()));
    });
    root.querySelectorAll('[data-session]').forEach((row) => {
      row.addEventListener('click', () => {
        openRecordSheet({ id: row.dataset.session, onChange: () => ctx.refresh() });
      });
    });
    root.querySelectorAll('[data-goal]').forEach((row) => {
      row.addEventListener('click', () => {
        const subject = getSubject(row.dataset.goal);
        if (subject) location.hash = '#/subjects';
      });
    });
    const posterBtn = root.querySelector('[data-act="report-poster"]');
    if (posterBtn) posterBtn.addEventListener('click', () => openPosterSheet());
    const textBtn = root.querySelector('[data-act="report-text"]');
    if (textBtn) textBtn.addEventListener('click', copyWeeklyText);
    const streakBtn = root.querySelector('[data-act="streak-card"]');
    if (streakBtn) streakBtn.addEventListener('click', () => openStreakCard());
    const reviewBtn = root.querySelector('[data-act="year-review"]');
    if (reviewBtn) reviewBtn.addEventListener('click', () => { ctx.go('#/review?year=' + new Date().getFullYear()); });
    const trendCanvas = root.querySelector('#trend-canvas');
    if (trendCanvas && trendSeries.length) drawTrendChart(trendCanvas, trendChart);
  }

  /* ---------- v1.7：科目趋势折线（跟随主题色的 Canvas） ---------- */
  function drawTrendChart(canvas, chart) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 320;
    const cssH = 190;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cvar = (name, fb) => (css.getPropertyValue(name) || '').trim() || fb;
    const gridColor = cvar('--border', '#e2e6f0');
    const textColor = cvar('--text-3', '#98a0b3');
    const PAD_L = 42; const PAD_R = 10; const PAD_T = 10; const PAD_B = 20;
    const plotW = cssW - PAD_L - PAD_R;
    const plotH = cssH - PAD_T - PAD_B;
    const n = chart.days.length;
    const xAt = (i) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (m) => PAD_T + plotH - (m / chart.max) * plotH;
    g.clearRect(0, 0, cssW, cssH);
    g.strokeStyle = gridColor;
    g.lineWidth = 1;
    [1, 0.5, 0].forEach((t) => {
      const y = Math.round(PAD_T + plotH - t * plotH) + 0.5;
      g.beginPath(); g.moveTo(PAD_L, y); g.lineTo(cssW - PAD_R, y); g.stroke();
      g.fillStyle = textColor; g.font = '10px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(fmtMinShort(Math.round(chart.max * t)), PAD_L - 6, y);
    });
    g.fillStyle = textColor; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    chart.days.forEach((d, i) => {
      if (i % 7 === 0 || i === n - 1) g.fillText(String(d.date.getDate()), xAt(i), PAD_T + plotH + 5);
    });
    chart.series.forEach((sr) => {
      g.strokeStyle = sr.color; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      sr.points.forEach((m, i) => {
        const x = xAt(i); const y = yAt(m);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
      g.fillStyle = sr.color;
      sr.points.forEach((m, i) => {
        if (m > 0) { g.beginPath(); g.arc(xAt(i), yAt(m), 2.2, 0, Math.PI * 2); g.fill(); }
      });
    });
  }

  /* ---------- 周报：海报 + 文字 ---------- */
  function copyWeeklyText() {
    const text = weeklyText(weekInfo);
    const done = () => toast('周报已复制，去粘贴吧');
    haptic();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { toast('复制失败，请手动选择文字'); }
    ta.remove();
  }

  function openPosterSheet() {
    haptic();
    openSheet(`
      <h2 class="sheet-title">学习周报海报</h2>
      <p class="sheet-desc">${weekInfo.rangeText} · 长按或保存下面的图片即可分享。</p>
      <div style="display:flex;justify-content:center">
        <canvas id="report-canvas" style="width:100%;max-width:300px;height:auto;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>
    `, (sheet) => {
      const canvas = sheet.querySelector('#report-canvas');
      drawWeeklyPoster(canvas, weekInfo);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = posterFilename(weekInfo);
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '海报已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('海报已保存');
        } catch (err) {
          console.error(err);
          toast('保存失败');
        }
      });
    });
  }

  /* ---------- 连续打卡分享卡 ---------- */
  function openStreakCard() {
    haptic();
    const data = {
      streak: streakDays,
      longest: longestDays,
      totalMin: allMin,
      days: lastNDays(7),
    };
    openSheet(`
      <h2 class="sheet-title">连续打卡卡</h2>
      <p class="sheet-desc">已连续 ${streakDays} 天 · 最长 ${longestDays} 天 · 累计 ${fmtMinShort(allMin)}</p>
      <div class="stats-canvas-wrap">
        <canvas id="streak-canvas" class="stats-canvas"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>
    `, (sheet) => {
      const canvas = sheet.querySelector('#streak-canvas');
      drawStreakCard(canvas, data);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = streakFilename(data);
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '打卡卡已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('打卡卡已保存');
          closeSheet();
        } catch (err) {
          console.error(err);
          toast('保存失败');
        }
      });
    });
  }

  return { title: '统计', sub: '看见自己的积累', html, mount };
}

function heatmap(weekStart) {
  const cells = [];
  const today = new Date();
  const start = startOfWeek(addDays(today, -7 * 7), weekStart);
  const days = lastNDays(56, today);
  const map = new Map(days.map((d) => [d.key, d.minutes]));
  const maxMin = Math.max(30, ...days.map((d) => d.minutes));
  const order = Array.from({ length: 8 * 7 }, (_, i) => addDays(start, i));
  order.forEach((d) => {
    const key = dateKey(d);
    const min = map.get(key) || 0;
    const level = min === 0 ? 0 : Math.min(4, Math.ceil((min / maxMin) * 4));
    const alpha = [0.06, 0.28, 0.48, 0.72, 1][level];
    const future = key > dateKey(today);
    cells.push(`<button type="button" data-day="${key}" title="${key} · ${fmtMinShort(min)}"${future ? ' disabled' : ''} style="aspect-ratio:1;padding:0;border:0;border-radius:5px;cursor:${future ? 'default' : 'pointer'};background:color-mix(in srgb,var(--primary) ${Math.round(alpha * 100)}%,var(--surface-2));${key === dateKey(today) ? 'outline:1.5px solid var(--primary);outline-offset:1px' : ''}${future ? ';opacity:.35' : ''}"></button>`);
  });
  return `<div class="heatmap" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${cells.join('')}</div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:10px" class="hint">
      <span>少</span>
      ${[0.06, 0.28, 0.48, 0.72, 1].map((a) => `<span style="width:11px;height:11px;border-radius:3px;background:color-mix(in srgb,var(--primary) ${Math.round(a * 100)}%,var(--surface-2))"></span>`).join('')}
      <span>多</span>
    </div>`;
}
