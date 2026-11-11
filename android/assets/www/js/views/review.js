/* 年度回顾（v1.14）：把一年的记录叠成一份可看的总结 + 可保存的海报 */
import { getState, yearSummary, dateKey, parseKey } from '../store.js';
import { esc, fmtMin, fmtMinShort, monthDayCN, openSheet, closeSheet, toast, haptic } from '../util.js';
import { openRecordSheet } from '../sheets.js';
import { drawYearPoster } from '../report.js';

function hourBandText(h) {
  if (h < 5) return '凌晨';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

export function yearlyText(d) {
  const lines = [];
  lines.push('📚 我的年度学习回顾');
  lines.push('📅 ' + d.year + ' 年');
  lines.push('');
  lines.push('⏱ 累计学习 ' + fmtMinShort(d.totalMin) + ' · ' + d.count + ' 条记录 · 学习 ' + d.activeDays + ' 天');
  if (d.longest) lines.push('🔥 最长连续 ' + d.longest + ' 天');
  if (d.bestDay) lines.push('🏆 最佳单日 ' + monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.min));
  if (d.bestMonth >= 0) lines.push('📈 最活跃月份 ' + (d.bestMonth + 1) + ' 月（' + fmtMinShort(d.byMonth[d.bestMonth].min) + '）');
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

export function renderReview(ctx) {
  const currentYear = new Date().getFullYear();
  const asked = Number(ctx.query.year);
  const year = Number.isFinite(asked) && asked > 0 ? Math.min(currentYear, Math.max(2000, Math.round(asked))) : currentYear;
  const d = yearSummary(year);
  const total = fmtMin(d.totalMin);
  const maxMonth = Math.max(30, ...d.byMonth.map((m) => m.min));
  const maxSubject = Math.max(1, ...d.subjects.map((s) => s.min));
  const maxTag = Math.max(1, ...d.tags.map((t) => t.count));
  const prevDisabled = year <= 2000;
  const nextDisabled = year >= currentYear;

  const nav = `
    <div class="year-nav fade-in">
      <button class="year-btn" type="button" data-year-step="-1" aria-label="上一年"${prevDisabled ? ' disabled' : ''}>‹</button>
      <div class="year-label"><b id="year-label">${year}</b><span>年度回顾</span></div>
      <button class="year-btn" type="button" data-year-step="1" aria-label="下一年"${nextDisabled ? ' disabled' : ''}>›</button>
    </div>`;

  let html = '';
  if (!d.count) {
    html = nav + `
      <section class="card fade-in" style="margin-top:14px">
        <div class="empty"><span class="em">🗓️</span>
          <p>${year} 年还没有学习记录</p>
          ${year === currentYear ? '<button class="btn primary" type="button" data-act="add" style="margin-top:6px">去记一笔</button>' : '<p class="hint">换一年看看，或回到 ' + currentYear + ' 年</p>'}
        </div>
      </section>`;
  } else {
    const bestText = d.bestDay ? monthDayCN(parseKey(d.bestDay.key)) + ' · ' + fmtMinShort(d.bestDay.min) : '—';
    const monthText = d.bestMonth >= 0 ? (d.bestMonth + 1) + ' 月 · ' + fmtMinShort(d.byMonth[d.bestMonth].min) : '—';
    const peakText = d.peakHour >= 0 ? hourBandText(d.peakHour) + '（' + d.peakHour + ' 点前后）' : '—';
    const spanText = d.firstKey ? monthDayCN(parseKey(d.firstKey)) + ' → ' + monthDayCN(parseKey(d.lastKey)) : '—';
    html = nav + `
      <section class="hero fade-in" style="margin-top:12px">
        <div class="hero-label">${year} 年累计学习</div>
        <div class="hero-value" id="review-total" aria-live="polite"><b>${total.value}</b><span>${total.unit}</span></div>
        <div class="hero-sub" id="review-sub">${d.count} 条记录 · ${d.activeDays} 天 · 平均每学 ${fmtMinShort(d.activeDays ? Math.round(d.totalMin / d.activeDays) : 0)}</div>
      </section>

      <div class="stat-grid fade-in">
        <div class="stat" id="review-days"><b>${d.activeDays}<small>天</small></b><span>学习天数</span></div>
        <div class="stat" id="review-longest"><b>${d.longest}<small>天</small></b><span>最长连续</span></div>
        <div class="stat" id="review-best"><b style="font-size:22px">${bestText}</b><span>最佳单日</span></div>
      </div>

      <section class="card fade-in">
        <div class="card-title"><h3>月度节奏</h3><span class="more">每个月学了多少</span></div>
        <div class="chart" id="month-chart">
          ${d.byMonth.map((m, i) => {
            const h = Math.max(m.min ? 5 : 3, Math.round((m.min / maxMonth) * 100));
            return '<div class="chart-col" data-month="' + (i + 1) + '" title="' + (i + 1) + ' 月 · ' + fmtMinShort(m.min) + ' · ' + m.count + ' 条">' +
              '<div class="chart-bar' + (m.min ? ' has' : '') + '" style="height:' + h + '%"></div>' +
              '<div class="chart-lbl">' + (i + 1) + '</div></div>';
          }).join('')}
        </div>
        <p class="hint mt12">最活跃的是 ${monthText}</p>
      </section>

      <section class="card fade-in">
        <div class="card-title"><h3>科目排行</h3><span class="more">这一年花时间最多的科目</span></div>
        ${d.subjects.length ? '<div class="bars" id="review-subjects">' +
          d.subjects.slice(0, 5).map((s) => '<div class="bar-line"><span class="name"><span style="opacity:.85">' + s.emoji + '</span> ' + esc(s.name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, Math.round((s.min / maxSubject) * 100)) + '%;background:' + s.color + '"></div></div><span class="bar-val">' + fmtMinShort(s.min) + '</span></div>').join('') +
          '</div>' : '<div class="empty"><span class="em">📊</span><p>还没有科目分布</p></div>'}
      </section>

      <section class="card fade-in">
        <div class="card-title"><h3>常用标签</h3><span class="more">按出现次数</span></div>
        ${d.tags.length ? '<div class="bars" id="review-tags">' +
          d.tags.map((t) => '<div class="bar-line"><span class="name">#' + esc(t.name) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.max(4, Math.round((t.count / maxTag) * 100)) + '%;background:#7d5cff"></div></div><span class="bar-val">' + t.count + ' 次</span></div>').join('') +
          '</div>' : '<div class="empty"><span class="em">🏷️</span><p>这一年没有用过标签</p></div>'}
      </section>

      <section class="card fade-in">
        <div class="card-title"><h3>这一年的几个瞬间</h3></div>
        <div class="milestones" id="mile-list">
          <div class="mile"><span>最活跃月份</span><b>${monthText}</b></div>
          <div class="mile"><span>最常学习时段</span><b>${peakText}</b></div>
          <div class="mile"><span>最佳单日</span><b>${bestText}</b></div>
          <div class="mile"><span>记录跨度</span><b>${spanText}</b></div>
        </div>
      </section>

      <section class="card fade-in">
        <div class="card-title"><h3>分享这一年</h3><span class="more">${year} 年度海报</span></div>
        <p class="hint" style="margin:0 0 14px">把这一年的坚持做成一张可以保存、分享的长图。</p>
        <div style="display:flex;gap:10px">
          <button class="btn primary" type="button" data-act="year-poster" style="flex:1">🖼️ 年度海报</button>
          <button class="btn" type="button" data-act="year-text" style="flex:1">📋 复制文字</button>
        </div>
      </section>`;
  }

  function mount(root) {
    root.querySelectorAll('[data-year-step]').forEach((b) => {
      b.addEventListener('click', () => {
        const delta = Number(b.dataset.yearStep);
        const next = Math.min(currentYear, Math.max(2000, year + delta));
        if (next === year) return;
        ctx.go('#/review?year=' + next);
      });
    });
    const addBtn = root.querySelector('[data-act="add"]');
    if (addBtn) addBtn.addEventListener('click', () => openRecordSheet({ onChange: () => ctx.refresh() }));
    const posterBtn = root.querySelector('[data-act="year-poster"]');
    if (posterBtn) posterBtn.addEventListener('click', openPoster);
    const textBtn = root.querySelector('[data-act="year-text"]');
    if (textBtn) textBtn.addEventListener('click', copyText);
  }

  function openPoster() {
    haptic();
    openSheet(`
      <h2 class="sheet-title">${year} 年度回顾海报</h2>
      <p class="sheet-desc">长按或保存下面的图片即可分享。</p>
      <div style="display:flex;justify-content:center">
        <canvas id="year-canvas" style="width:100%;max-width:300px;height:auto;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>`, (sheet) => {
      const canvas = sheet.querySelector('#year-canvas');
      drawYearPoster(canvas, d);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = '年度回顾-' + year + '.png';
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '年度海报已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('年度海报已保存');
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
    const text = yearlyText(d);
    const done = () => toast('已复制年度总结');
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

  return { title: '年度回顾', sub: year + ' 年，看看自己走了多远', html, mount };
}
