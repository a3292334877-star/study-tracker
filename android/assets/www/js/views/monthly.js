/* 月度报告（v1.26）：把一个月的学习叠成一份总结 + 可保存的月报海报 */
import { monthSummary, dateKey, parseKey } from '../store.js';
import { esc, fmtMin, fmtMinShort, monthDayCN, openSheet, closeSheet, toast, haptic } from '../util.js';
import { openRecordSheet, openDaySheet } from '../sheets.js';
import { drawMonthPoster } from '../report.js';

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

function hourBandText(h) {
  if (h < 0) return '—';
  if (h < 5) return '凌晨';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

export function monthlyText(d) {
  const lines = [];
  lines.push('📚 我的学习月报');
  lines.push('📅 ' + d.label);
  lines.push('');
  lines.push('⏱ 累计学习 ' + fmtMinShort(d.totalMin) + ' · ' + d.count + ' 条记录 · 学习 ' + d.activeDays + ' 天');
  if (d.longest) lines.push('🔥 最长连续 ' + d.longest + ' 天');
  if (d.bestDay) lines.push('🏆 最佳单日 ' + monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.min));
  if (d.monthlyGoal > 0) lines.push('🎯 月度目标 ' + fmtMinShort(d.totalMin) + ' / ' + fmtMinShort(d.monthlyGoal) + '（' + d.monthGoalPct + '%）');
  if (d.subjects.length) {
    lines.push('');
    lines.push('📖 科目排行：');
    d.subjects.slice(0, 5).forEach((s, i) => lines.push('  ' + (i + 1) + '. ' + s.emoji + ' ' + s.name + '：' + fmtMinShort(s.min)));
  }
  if (d.tags.length) {
    lines.push('');
    lines.push('🏷️ 常用标签：' + d.tags.slice(0, 5).map((t) => '#' + t.name).join(' '));
  }
  lines.push('');
  lines.push('—— 来自「学习记录」App');
  return lines.join('\n');
}

export function renderMonthly(ctx) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const askedYear = Number(ctx.query.year);
  const askedMonth = Number(ctx.query.month);
  const year = Number.isFinite(askedYear) && askedYear > 0
    ? Math.min(currentYear, Math.max(2000, Math.round(askedYear)))
    : currentYear;
  let month = Number.isFinite(askedMonth) && askedMonth >= 1
    ? Math.max(0, Math.min(11, Math.round(askedMonth) - 1))
    : currentMonth;
  if (year === currentYear) month = Math.min(month, currentMonth);
  const d = monthSummary(year, month);
  const total = fmtMin(d.totalMin);
  const maxSubject = Math.max(1, ...d.subjects.map((s) => s.min));
  const maxTag = Math.max(1, ...d.tags.map((t) => t.count));
  const prevDisabled = year <= 2000;
  const nextDisabled = year >= currentYear && month >= currentMonth;
  const todayKey = dateKey(now);
  const weekStart = d.weekStart;
  const weekHeaders = Array.from({ length: 7 }, (_, i) => WEEK_CN[(weekStart + i) % 7]);
  const firstDow = new Date(year, month, 1).getDay();
  const offset = (firstDow - weekStart + 7) % 7;
  const cells = Array.from({ length: offset }, () => null).concat(d.byDay);
  while (cells.length % 7 !== 0) cells.push(null);
  const activeCells = d.byDay.filter((x) => x.minutes > 0).length;

  const nav = `
    <div class="year-nav fade-in">
      <button class="year-btn" type="button" data-month-step="-1" aria-label="上个月"${prevDisabled ? ' disabled' : ''}>‹</button>
      <div class="year-label"><b id="month-label">${d.label}</b><span>月度报告</span></div>
      <button class="year-btn" type="button" data-month-step="1" aria-label="下个月"${nextDisabled ? ' disabled' : ''}>›</button>
    </div>`;

  const deltaText = d.prevDeltaPct === null
    ? (d.prevMin ? '' : '上月无记录')
    : d.prevDeltaPct === 0 ? '与上月持平' : (d.prevDeltaPct > 0 ? '较上月 +' + d.prevDeltaPct + '%' : '较上月 ' + d.prevDeltaPct + '%');
  const deltaClass = d.prevDeltaPct === null || d.prevDeltaPct === 0 ? '' : (d.prevDeltaPct > 0 ? ' is-up' : ' is-down');
  const bestText = d.bestDay ? monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.min) : '—';
  const peakText = d.peakHour >= 0 ? hourBandText(d.peakHour) + '（' + d.peakHour + ' 点前后）' : '—';
  const goalText = d.monthlyGoal > 0
    ? fmtMinShort(d.totalMin) + ' / ' + fmtMinShort(d.monthlyGoal) + '（' + d.monthGoalPct + '%）'
    : '未设置';

  const html = nav + `
    <section class="hero month-hero fade-in" style="margin-top:12px">
      <div class="hero-label">${d.label} · 累计学习</div>
      <div class="hero-value" id="month-total" aria-live="polite"><b>${total.value}</b><span>${total.unit}</span></div>
      <div class="hero-sub" id="month-sub">${d.count} 条记录 · 学习 ${d.activeDays} 天 · 平均每学 ${fmtMinShort(d.avgPerActive)}</div>
      <div class="hero-bar"><i style="width:${d.monthGoalPct}%"></i></div>
      <div class="hero-foot">
        <span>${d.monthlyGoal > 0 ? '月度目标 ' + d.monthGoalPct + '%' : '未设置月度目标'}</span>
        <span class="month-delta${deltaClass}">${deltaText}</span>
      </div>
    </section>

    <div class="stat-grid fade-in">
      <div class="stat"><b>${d.activeDays}<small>天</small></b><span>学习天数</span></div>
      <div class="stat"><b>${d.goalMetDays}<small>天</small></b><span>目标达标</span></div>
      <div class="stat"><b>${d.longest}<small>天</small></b><span>最长连续</span></div>
    </div>

    <section class="card fade-in month-cal-card">
      <div class="card-title"><h3>本月日历</h3><span class="more">${activeCells} 天有记录</span></div>
      <div class="month-weekdays">${weekHeaders.map((w) => '<span>' + w + '</span>').join('')}</div>
      <div class="month-grid" id="month-grid">
        ${cells.map((c) => c
          ? '<button class="month-cell lv' + c.level + (c.goalMet ? ' is-goal-met' : '') + (c.future ? ' is-future' : '') + (c.key === todayKey ? ' is-today' : '') + '" type="button" data-day="' + c.key + '" aria-label="' + c.key + ' · ' + (c.minutes ? fmtMinShort(c.minutes) : '没有记录') + '"><span>' + c.day + '</span></button>'
          : '<span class="month-cell is-empty"></span>').join('')}
      </div>
      <div class="month-legend"><span>少</span><i class="month-dot lv1"></i><i class="month-dot lv2"></i><i class="month-dot lv3"></i><i class="month-dot lv4"></i><span>多</span><span class="month-legend-goal">◉ 达标日</span></div>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>科目排行</h3><span class="more">这个月花时间最多的科目</span></div>
      ${d.subjects.length ? '<div class="bars" id="month-subjects">' +
        d.subjects.slice(0, 6).map((s) => '<div class="bar-line"><span class="name"><span style="opacity:.85">' + s.emoji + '</span> ' + esc(s.name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, Math.round((s.min / maxSubject) * 100)) + '%;background:' + s.color + '"></div></div><span class="bar-val">' + fmtMinShort(s.min) + '</span></div>').join('') +
        '</div>' : '<div class="empty"><span class="em">📊</span><p>这个月还没有科目分布</p></div>'}
    </section>

    ${d.tags.length ? `<section class="card fade-in">
      <div class="card-title"><h3>常用标签</h3><span class="more">按出现次数</span></div>
      <div class="month-tags" id="month-tags">
        ${d.tags.map((t) => '<span class="month-tag">#' + esc(t.name) + '<em>' + t.count + '</em></span>').join('')}
      </div>
    </section>` : ''}

    <section class="card fade-in">
      <div class="card-title"><h3>本月小结</h3></div>
      <div class="milestones" id="month-miles">
        <div class="mile"><span>最佳单日</span><b>${bestText}</b></div>
        <div class="mile"><span>最常学习时段</span><b>${peakText}</b></div>
        <div class="mile"><span>月度目标</span><b>${goalText}</b></div>
        <div class="mile"><span>与上月对比</span><b>${deltaText || '—'}</b></div>
      </div>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>分享这个月</h3><span class="more">${d.label} 月报</span></div>
      <p class="hint" style="margin:0 0 14px">把这个月的坚持做成一张可以保存、分享的长图。</p>
      <div style="display:flex;gap:10px">
        <button class="btn primary" type="button" data-act="month-poster" style="flex:1">🖼️ 月度海报</button>
        <button class="btn" type="button" data-act="month-text" style="flex:1">📋 复制文字</button>
      </div>
    </section>`;

  function goMonth(delta) {
    let y = year;
    let m = month + delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y < 2000 || y > currentYear) return;
    if (y === currentYear && m > currentMonth) return;
    ctx.go('#/monthly?year=' + y + '&month=' + (m + 1));
  }

  function mount(root) {
    root.querySelectorAll('[data-month-step]').forEach((b) => {
      b.addEventListener('click', () => goMonth(Number(b.dataset.monthStep)));
    });
    root.querySelectorAll('[data-day]').forEach((b) => {
      b.addEventListener('click', () => openDaySheet(b.dataset.day, () => ctx.refresh()));
    });
    const posterBtn = root.querySelector('[data-act="month-poster"]');
    if (posterBtn) posterBtn.addEventListener('click', openPoster);
    const textBtn = root.querySelector('[data-act="month-text"]');
    if (textBtn) textBtn.addEventListener('click', copyText);
  }

  function openPoster() {
    haptic();
    openSheet(`
      <h2 class="sheet-title">${d.label} 学习月报</h2>
      <p class="sheet-desc">长按或保存下面的图片即可分享。</p>
      <div style="display:flex;justify-content:center">
        <canvas id="month-canvas" style="width:100%;max-width:300px;height:auto;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>`, (sheet) => {
      const canvas = sheet.querySelector('#month-canvas');
      drawMonthPoster(canvas, d);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = '学习月报-' + d.year + '-' + String(d.month + 1).padStart(2, '0') + '.png';
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '月报已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('月报已保存');
          closeSheet();
        } catch (err) {
          console.error(err);
          toast('保存失败');
        }
      });
    });
  }

  function copyText() {
    haptic();
    const text = monthlyText(d);
    const done = () => toast('已复制月报总结');
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

  return { title: '月度报告', sub: d.label + ' · 看看这个月走了多远', html, mount };
}
