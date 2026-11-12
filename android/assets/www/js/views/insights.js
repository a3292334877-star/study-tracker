/* 学习洞察（v1.28）：把一段时间的学习节奏、时段、星期、科目与标签
   聚合成一张可读的画像，并自动给出几句观察。只读数据，不做修改。 */
import { insightsSummary } from '../store.js';
import { esc, fmtMinShort, parseKey, relativeDay } from '../util.js';

const RANGES = [
  { key: '30', label: '近 30 天', days: 30 },
  { key: '90', label: '近 90 天', days: 90 },
  { key: '365', label: '近一年', days: 365 },
];
const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function hourBandText(h) {
  if (h < 5) return '凌晨';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '中午';
  if (h < 18) return '下午';
  return '晚上';
}

function rangeBar(current) {
  return '<div class="seg insights-range" role="tablist" aria-label="选择洞察范围">'
    + RANGES.map((r) => '<button type="button" role="tab" aria-selected="' + (r.key === current.key) + '" class="' + (r.key === current.key ? 'on' : '') + '" data-range="' + r.key + '">' + r.label + '</button>').join('')
    + '</div>';
}

function deltaInfo(s) {
  if (s.prevMinutes > 0) {
    const p = s.deltaPct || 0;
    if (p === 0) return { text: '与前 ' + s.days + ' 天持平', kind: 'flat' };
    return { text: (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + '%', kind: p > 0 ? 'up' : 'down' };
  }
  return { text: s.minutes > 0 ? '新的开始' : '', kind: 'flat' };
}

export function renderInsights(ctx) {
  const raw = String(ctx.query.range || '30');
  const range = RANGES.find((r) => r.key === raw) || RANGES[0];
  const s = insightsSummary(range.days);
  const title = '学习洞察';
  const sub = range.label + ' · 看见自己的学习节奏';

  if (!s.count) {
    return {
      title,
      sub,
      html: rangeBar(range)
        + '<section class="card fade-in" id="insights-empty"><div class="empty"><span class="em">🧭</span>'
        + '<p>这段时间还没有学习记录<br/>记几次之后，这里会告诉你自己的学习节奏。</p>'
        + '<a class="btn primary" href="#/log">去记一笔</a></div></section>',
      mount(root) {
        root.querySelectorAll('[data-range]').forEach((b) => {
          b.addEventListener('click', () => ctx.go('#/insights?range=' + b.dataset.range));
        });
      },
    };
  }

  const delta = deltaInfo(s);
  const hourMax = Math.max(30, ...s.hourBars);
  const weekMax = Math.max(1, ...s.weekdayBars);
  const hours = s.hourBars.map((m, h) => {
    const pct = Math.max(m ? 4 : 2, Math.round((m / hourMax) * 100));
    const lbl = [0, 6, 12, 18, 23].includes(h) ? String(h) : '';
    return '<div class="chart-col" title="' + h + ' 点 · ' + fmtMinShort(m) + '">'
      + '<div class="chart-bar' + (m ? ' has' : '') + '" style="height:' + pct + '%"></div>'
      + '<div class="chart-lbl' + (h === s.peakHour ? ' on' : '') + '">' + lbl + '</div></div>';
  }).join('');
  const weekdays = s.weekdayBars.map((m, w) => {
    const pct = Math.max(m ? 4 : 2, Math.round((m / weekMax) * 100));
    return '<div class="chart-col" title="' + WEEK[w] + ' · ' + fmtMinShort(m) + '">'
      + '<div class="chart-bar' + (m ? ' has' : '') + '" style="height:' + pct + '%"></div>'
      + '<div class="chart-lbl' + (w === s.peakWeekday ? ' on' : '') + '">' + WEEK[w].slice(1) + '</div></div>';
  }).join('');
  const subjectMax = Math.max(1, ...s.subjects.map((x) => x.minutes));
  const subjectRows = s.subjects.slice(0, 6).map((x) => '<div class="bar-line">'
    + '<span class="name"><span style="opacity:.85">' + x.emoji + '</span> ' + esc(x.name) + '</span>'
    + '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(3, Math.round((x.minutes / subjectMax) * 100)) + '%;background:' + x.color + '"></div></div>'
    + '<span class="bar-val">' + x.pct + '%</span></div>').join('');
  const tags = s.tags.slice(0, 10).map((t) => '<span class="insight-tag">#' + esc(t.tag) + '<small>' + t.count + ' 次</small></span>').join('');

  const observations = [];
  const cmp = s.prevMinutes > 0
    ? (s.deltaPct === 0 ? '与前 ' + s.days + ' 天基本持平' : '比前 ' + s.days + ' 天' + (s.deltaPct > 0 ? '多' : '少') + '了 ' + Math.abs(s.deltaPct) + '%')
    : '前 ' + s.days + ' 天没有记录，这次是新的开始';
  observations.push('这段时间你累计学习 <b>' + fmtMinShort(s.minutes) + '</b>，' + cmp + '。');
  observations.push('其中有 <b>' + s.activeDays + '</b> 天留下记录（活跃率 ' + s.activeRate + '%），最长连续 <b>' + s.bestStreak + '</b> 天。');
  if (s.peakHour >= 0) {
    observations.push('最常在 <b>' + hourBandText(s.peakHour) + '</b>（' + s.peakHour + ' 点前后）开始学习' + (s.peakWeekday >= 0 ? '，<b>' + WEEK[s.peakWeekday] + '</b>投入最多' : '') + '。');
  }
  if (s.subjects.length) {
    const top = s.subjects[0];
    observations.push('投入最多的是 <b>' + esc(top.name) + '</b>，占 ' + top.pct + '%' + (top.pct >= 60 ? '，可以留意一下科目均衡' : '，整体分布比较均衡') + '。');
  }
  if (s.tags.length) {
    observations.push('最常用标签 <b>#' + esc(s.tags[0].tag) + '</b>，出现 ' + s.tags[0].count + ' 次。');
  }
  const observeHTML = observations.map((t) => '<li><span class="insight-ic">💡</span><span>' + t + '</span></li>').join('');

  const html = rangeBar(range)
    + '<section class="card insights-hero fade-in">'
    + '<div class="insights-hero-top"><span>' + range.label + '</span><span class="insights-delta ' + delta.kind + '">' + delta.text + '</span></div>'
    + '<div class="insights-hero-main"><b>' + fmtMinShort(s.minutes) + '</b><span>累计学习 · ' + s.count + ' 条记录</span></div>'
    + '<div class="stat-grid insights-stat-grid">'
    + '<div class="stat"><b>' + s.activeDays + '<small> 天</small></b><span>有记录</span></div>'
    + '<div class="stat"><b>' + s.activeRate + '<small>%</small></b><span>活跃率</span></div>'
    + '<div class="stat"><b>' + fmtMinShort(s.avgSession) + '</b><span>平均单次</span></div>'
    + '<div class="stat"><b>' + s.bestStreak + '<small> 天</small></b><span>最长连续</span></div>'
    + '</div>'
    + (s.bestDay ? '<p class="hint mt12">最佳单日：' + esc(relativeDay(parseKey(s.bestDay.key))) + ' · ' + fmtMinShort(s.bestDay.minutes) + ' · ' + s.bestDay.count + ' 条</p>' : '')
    + '</section>'

    + '<section class="card fade-in">'
    + '<div class="card-title"><h3>昼夜节律</h3><span class="more">按开始时间</span></div>'
    + '<div class="chart chart-hours">' + hours + '</div>'
    + '<p class="hint mt12">' + (s.peakHour >= 0 ? '最常在 ' + hourBandText(s.peakHour) + '（' + s.peakHour + ' 点前后）开始学习' : '还没有可分析的记录') + '</p>'
    + '</section>'

    + '<section class="card fade-in">'
    + '<div class="card-title"><h3>一周节奏</h3><span class="more">按星期几</span></div>'
    + '<div class="chart chart-week">' + weekdays + '</div>'
    + '<p class="hint mt12">' + (s.peakWeekday >= 0 ? WEEK[s.peakWeekday] + ' 是你投入最多的一天' : '还没有可分析的记录') + '</p>'
    + '</section>'

    + '<section class="card fade-in">'
    + '<div class="card-title"><h3>科目结构</h3><span class="more">按学习时长占比</span></div>'
    + '<div class="bars">' + subjectRows + '</div>'
    + '</section>'

    + '<section class="card fade-in">'
    + '<div class="card-title"><h3>常用标签</h3><span class="more">' + s.tags.length + ' 个标签</span></div>'
    + (tags ? '<div class="insight-tags">' + tags + '</div>' : '<div class="empty" style="padding:18px 0"><p>这段时间还没有用过标签</p></div>')
    + '</section>'

    + '<section class="card fade-in">'
    + '<div class="card-title"><h3>给你的观察</h3><span class="more">基于这段时间的数据</span></div>'
    + '<ul class="insight-observe">' + observeHTML + '</ul>'
    + '</section>'
    + '<p class="insight-foot"><a href="#/stats">查看完整统计 →</a></p>';

  return {
    title,
    sub,
    html,
    mount(root) {
      root.querySelectorAll('[data-range]').forEach((b) => {
        b.addEventListener('click', () => ctx.go('#/insights?range=' + b.dataset.range));
      });
    },
  };
}
