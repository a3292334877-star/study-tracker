/* 学习周报（v1.29）：可回看的独立周报页，支持过去周切换与海报 / 文字分享 */
import { getState, dateKey, addDays, startOfWeek, parseKey } from '../store.js';
import { esc, fmtMin, fmtMinShort, monthDayCN, openSheet, closeSheet, toast, haptic } from '../util.js';
import { openRecordSheet, openDaySheet } from '../sheets.js';
import { weekData, weeklyText, drawWeeklyPoster, posterFilename } from '../report.js';

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

export function renderWeekly(ctx) {
  const state = getState();
  const weekStart = Number(state.settings.weekStart) === 0 ? 0 : 1;
  const now = new Date();
  const currentStart = startOfWeek(now, weekStart);
  const raw = String(ctx.query.week || '').trim();
  let start = currentStart;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const asked = parseKey(raw);
    if (!Number.isNaN(asked.getTime())) start = startOfWeek(asked, weekStart);
  }
  const minStart = new Date(2000, 0, 3);
  if (start < minStart) start = minStart;
  if (start > currentStart) start = currentStart;
  const isCurrent = dateKey(start) === dateKey(currentStart);
  const prevDisabled = start <= minStart;
  const nextDisabled = isCurrent;

  const d = weekData(weekStart, start);
  const prev = weekData(weekStart, addDays(start, -7));
  const deltaPct = prev.totalMin > 0 ? Math.round(((d.totalMin - prev.totalMin) / prev.totalMin) * 100) : null;
  const deltaText = prev.totalMin === 0
    ? (d.totalMin ? '上周没有记录' : '')
    : deltaPct === 0 ? '与上周持平' : (deltaPct > 0 ? '较上周 +' + deltaPct + '%' : '较上周 ' + deltaPct + '%');
  const deltaClass = deltaPct === null || deltaPct === 0 ? '' : (deltaPct > 0 ? ' is-up' : ' is-down');
  const total = fmtMin(d.totalMin);
  const maxDay = Math.max(30, ...d.daily.map((x) => x.minutes));
  const maxSubject = Math.max(1, ...d.subjects.map((s) => s.min));
  const goalRows = d.subjects
    .filter((s) => s.goalMinWeek > 0)
    .map((s) => ({ ...s, pct: Math.min(100, Math.round((s.min / s.goalMinWeek) * 100)) }));
  const goalDone = goalRows.filter((s) => s.min >= s.goalMinWeek).length;
  const bestText = d.bestDay ? monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.minutes) : '—';
  const peakText = d.peakHour >= 0 ? hourBandText(d.peakHour) + '（' + d.peakHour + ' 点前后）' : '—';
  const weekGoalText = d.weeklyGoal > 0
    ? fmtMinShort(d.totalMin) + ' / ' + fmtMinShort(d.weeklyGoal) + '（' + d.goalPct + '%）'
    : '未设置周总目标';

  const nav = `
    <div class="year-nav fade-in week-nav">
      <button class="year-btn" type="button" data-week-step="-1" aria-label="上一周"${prevDisabled ? ' disabled' : ''}>‹</button>
      <div class="year-label"><b>${d.rangeText}</b><span>${isCurrent ? '本周' : '历史周报'}</span></div>
      <button class="year-btn" type="button" data-week-step="1" aria-label="下一周"${nextDisabled ? ' disabled' : ''}>›</button>
    </div>
    ${isCurrent ? '' : '<button class="week-current-btn" type="button" data-week-current>↩ 回到本周</button>'}`;

  const hero = `
    <section class="hero month-hero fade-in" style="margin-top:12px">
      <div class="hero-label">${d.rangeText} · 累计学习</div>
      <div class="hero-value" id="week-total" aria-live="polite"><b>${total.value}</b><span>${total.unit}</span></div>
      <div class="hero-sub" id="week-sub">${d.count} 条记录 · 学习 ${d.activeDays} 天 · 平均每学 ${fmtMinShort(d.avg)}</div>
      ${d.weeklyGoal > 0 ? '<div class="hero-bar"><i style="width:' + d.goalPct + '%"></i></div>' : ''}
      <div class="hero-foot">
        <span>${d.weeklyGoal > 0 ? '本周目标 ' + d.goalPct + '%' : '未设置周总目标'}</span>
        <span class="month-delta${deltaClass}">${deltaText}</span>
      </div>
    </section>`;

  const daysCard = `
    <section class="card fade-in week-chart-card">
      <div class="card-title"><h3>这一周</h3><span class="more">最高 ${fmtMinShort(Math.max(0, ...d.daily.map((x) => x.minutes)))}</span></div>
      <div class="week-days" id="week-days">
        ${d.daily.map((x, i) => `<button class="week-day${x.minutes ? '' : ' is-zero'}${x.isToday ? ' is-today' : ''}${x.goalMet ? ' is-goal' : ''}${x.future ? ' is-future' : ''}" type="button" data-day="${x.key}"${x.future ? ' disabled' : ''} aria-label="${WEEK_CN[(weekStart + i) % 7]} · ${x.key} · ${x.minutes ? fmtMinShort(x.minutes) : '没有记录'}">
          <span class="week-day-bar"><i style="height:${x.minutes ? Math.max(6, Math.round((x.minutes / maxDay) * 100)) : 0}%"></i></span>
          <span class="week-day-val">${x.minutes ? fmtMinShort(x.minutes) : ''}</span>
          <span class="week-day-lbl">周${WEEK_CN[(weekStart + i) % 7]}<em>${x.day}</em></span>
        </button>`).join('')}
      </div>
      <p class="hint mt12">点任意一天，可以回看或补记这天的学习。</p>
    </section>`;

  const goalCard = `
    <section class="card fade-in week-goal-card">
      <div class="card-title"><h3>本周目标</h3><span class="more">${goalRows.length ? goalDone + '/' + goalRows.length + ' 个科目达成' : '按周看进度'}</span></div>
      ${d.weeklyGoal > 0 ? `
        <div class="week-goal-top"><b>${d.goalPct}%</b><span>${d.goalPct >= 100 ? '周总目标已达成' : '还差 ' + fmtMinShort(Math.max(0, d.weeklyGoal - d.totalMin))}</span></div>
        <div class="hero-bar"><i style="width:${d.goalPct}%"></i></div>` : ''}
      ${goalRows.length ? `
        <div class="bars" style="margin-top:14px">
          ${goalRows.map((g) => `<div class="bar-line"><span class="name"><span style="opacity:.85">${g.emoji}</span> ${esc(g.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, g.pct)}%;background:${g.pct >= 100 ? 'var(--success, #12b76a)' : g.color}"></div></div><span class="bar-val" style="color:${g.pct >= 100 ? 'var(--success, #12b76a)' : 'var(--text-3)'}">${g.pct}%</span></div>`).join('')}
        </div>` : '<p class="hint" style="margin:12px 0 0">给科目设置每周目标后，这里会显示每个科目的完成进度。</p>'}
      <p class="hint mt12">周总目标在「我的 · 学习目标」里设置，科目目标在科目编辑里设置。</p>
    </section>`;

  const subjectCard = d.subjects.length ? `
    <section class="card fade-in">
      <div class="card-title"><h3>科目分布</h3><span class="more">这一周的时间去向</span></div>
      <div class="bars" id="week-subjects">
        ${d.subjects.slice(0, 8).map((s) => `<div class="bar-line"><span class="name"><span style="opacity:.85">${s.emoji}</span> ${esc(s.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.round((s.min / maxSubject) * 100))}%;background:${s.color}"></div></div><span class="bar-val">${fmtMinShort(s.min)}</span></div>`).join('')}
      </div>
    </section>` : '';

  const tagCard = d.tags.length ? `
    <section class="card fade-in">
      <div class="card-title"><h3>常用标签</h3><span class="more">按出现次数</span></div>
      <div class="month-tags" id="week-tags">
        ${d.tags.map((t) => '<span class="month-tag">#' + esc(t.name) + '<em>' + t.count + '</em></span>').join('')}
      </div>
    </section>` : '';

  const highlightCard = `
    <section class="card fade-in">
      <div class="card-title"><h3>本周学了什么</h3><span class="more">${d.highlights.length ? d.highlights.length + ' 个主题' : '记录标题'}</span></div>
      ${d.highlights.length
        ? '<ul class="week-highlights">' + d.highlights.map((t) => '<li><span class="week-hl-dot"></span><span>' + esc(t) + '</span></li>').join('') + '</ul>'
        : '<div class="empty"><span class="em">✏️</span><p>这一周还没有写下学习内容</p></div>'}
    </section>`;

  const summaryCard = `
    <section class="card fade-in">
      <div class="card-title"><h3>本周小结</h3></div>
      <div class="milestones">
        <div class="mile"><span>最佳单日</span><b>${bestText}</b></div>
        <div class="mile"><span>最常学习时段</span><b>${peakText}</b></div>
        <div class="mile"><span>周总目标</span><b>${weekGoalText}</b></div>
        <div class="mile"><span>与上周对比</span><b>${deltaText || '—'}</b></div>
      </div>
    </section>`;

  const shareCard = `
    <section class="card fade-in">
      <div class="card-title"><h3>分享这一周</h3><span class="more">${d.rangeText} 周报</span></div>
      <p class="hint" style="margin:0 0 14px">把这一周的坚持做成一张可以保存、分享的长图。</p>
      <div style="display:flex;gap:10px">
        <button class="btn primary" type="button" data-act="week-poster" style="flex:1">🖼️ 周报海报</button>
        <button class="btn" type="button" data-act="week-text" style="flex:1">📋 复制文字</button>
      </div>
    </section>`;

  const emptyCard = `
    <section class="card fade-in week-empty" id="week-empty">
      <div class="empty"><span class="em">🌱</span><p>这一周还没有学习记录</p></div>
      <p class="hint">从一条小记录开始，下周回来看这周的自己。</p>
      <button class="btn primary block" type="button" data-act="week-add">＋ 记一笔</button>
    </section>`;

  const html = nav + hero + (d.count === 0 ? emptyCard : daysCard + goalCard + subjectCard + tagCard + highlightCard + summaryCard + shareCard);

  function goWeek(delta) {
    const target = addDays(start, delta * 7);
    if (target > currentStart || target < minStart) return;
    ctx.go('#/weekly?week=' + dateKey(target));
  }

  function mount(root) {
    root.querySelectorAll('[data-week-step]').forEach((b) => {
      b.addEventListener('click', () => goWeek(Number(b.dataset.weekStep)));
    });
    const currentBtn = root.querySelector('[data-week-current]');
    if (currentBtn) currentBtn.addEventListener('click', () => ctx.go('#/weekly'));
    root.querySelectorAll('[data-day]').forEach((b) => {
      b.addEventListener('click', () => openDaySheet(b.dataset.day, () => ctx.refresh()));
    });
    const addBtn = root.querySelector('[data-act="week-add"]');
    if (addBtn) addBtn.addEventListener('click', () => openRecordSheet({ onChange: () => ctx.refresh() }));
    const posterBtn = root.querySelector('[data-act="week-poster"]');
    if (posterBtn) posterBtn.addEventListener('click', openPoster);
    const textBtn = root.querySelector('[data-act="week-text"]');
    if (textBtn) textBtn.addEventListener('click', copyText);
  }

  function openPoster() {
    haptic();
    openSheet(`
      <h2 class="sheet-title">${d.rangeText} 学习周报</h2>
      <p class="sheet-desc">长按或保存下面的图片即可分享。</p>
      <div style="display:flex;justify-content:center">
        <canvas id="week-canvas" style="width:100%;max-width:300px;height:auto;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>`, (sheet) => {
      const canvas = sheet.querySelector('#week-canvas');
      drawWeeklyPoster(canvas, d);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = posterFilename(d);
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '周报已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('周报已保存');
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
    const text = weeklyText(d);
    const done = () => toast('已复制周报总结');
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

  return { title: '学习周报', sub: d.rangeText + ' · 这一周走了多远', html, mount };
}
