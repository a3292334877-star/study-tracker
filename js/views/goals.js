/* 学习目标（v1.22）：今日 / 本周 / 本月目标与达标历史 */
import { getState, goalOverview, goalHistory, dailyGoalHistory, setGoal } from '../store.js';
import {
  fmtMinShort, haptic, toast, openSheet, closeSheet, parseKey,
} from '../util.js';

const GOAL_CFG = {
  dailyGoalMin: {
    title: '每日目标', desc: '每天想学习多少分钟？', unit: '分钟',
    min: 10, max: 720, step: 10, hours: false, presets: [30, 60, 90, 120, 180, 240],
  },
  weeklyGoalMin: {
    title: '每周目标', desc: '一周想累计学习多少小时？', unit: '小时',
    min: 0, max: 84, step: 0.5, hours: true, presets: [5, 8, 10, 12, 15, 20],
  },
  monthlyGoalMin: {
    title: '每月目标', desc: '一个月想累计学习多少小时？', unit: '小时',
    min: 0, max: 360, step: 1, hours: true, presets: [20, 30, 40, 50, 60, 80],
  },
};

function weekRange(startKey, endKey) {
  const s = parseKey(startKey);
  const e = parseKey(endKey);
  return (s.getMonth() + 1) + '/' + s.getDate() + '–' + (e.getMonth() + 1) + '/' + e.getDate();
}

function bar(pct) {
  const w = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return '<div class="goal-bar"><i style="width:' + w + '%"></i></div>';
}

function targetText(minutes, hours) {
  if (!(minutes > 0)) return '不设目标';
  if (!hours) return fmtMinShort(minutes);
  const h = minutes / 60;
  return (Math.round(h * 10) / 10) + ' 小时';
}

function goalCard(key, icon, title, m, note) {
  const has = m.target > 0;
  const stateText = has ? (m.met ? '已达成' : '还差 ' + fmtMinShort(m.remaining)) : '还没设目标';
  return '<button class="card goal-card" type="button" data-goal-edit="' + key + '" data-goal-card="' + key + '">'
    + '<div class="goal-card-top"><span class="goal-emoji">' + icon + '</span><span class="goal-card-title">' + title + '</span><b class="goal-card-pct">' + (has ? m.pct : 0) + '%</b></div>'
    + bar(has ? m.pct : 0)
    + '<div class="goal-card-sub">' + (has ? fmtMinShort(m.actual) + ' / ' + fmtMinShort(m.target) : '点此设置目标') + '</div>'
    + '<div class="goal-card-note">' + stateText + (note ? ' · ' + note : '') + '</div>'
    + '</button>';
}

function weekRow(w) {
  return '<div class="goal-week-row' + (w.met ? ' is-met' : '') + (w.current ? ' is-current' : '') + '" data-goal-week="' + w.startKey + '">'
    + '<span class="goal-week-label">' + w.label + '</span>'
    + '<div class="goal-bar"><i style="width:' + w.pct + '%"></i></div>'
    + '<span class="goal-week-actual">' + fmtMinShort(w.actual) + '</span>'
    + '<span class="goal-week-pct">' + (w.target > 0 ? w.pct + '%' : '—') + '</span>'
    + '</div>';
}

function settingRow(key, icon, title, sub, value, hours) {
  return '<button class="row goal-setting-row" type="button" data-goal-set="' + key + '">'
    + '<div class="row-ic">' + icon + '</div>'
    + '<div class="row-main"><div class="row-title">' + title + '</div><div class="row-sub">' + sub + '</div></div>'
    + '<div class="row-val">' + targetText(value, hours) + '</div>'
    + '<div class="row-chev">›</div></button>';
}

export function renderGoals(ctx) {
  const ov = goalOverview();
  const { daily, weekly, monthly } = ov;
  const weeks = goalHistory(12);
  const dailyHist = dailyGoalHistory(12);
  const metWeeks = weeks.filter((w) => w.met).length;

  const html = `
    <section class="hero goals-hero fade-in">
      <div class="hero-label">本周目标</div>
      <div class="hero-value"><b data-goal-weekly-pct>${weekly.pct}</b><span>%</span></div>
      <div class="hero-sub">${weekly.target > 0
        ? fmtMinShort(weekly.actual) + ' / ' + fmtMinShort(weekly.target) + (weekly.met ? ' · 已达成' : ' · 还差 ' + fmtMinShort(weekly.remaining))
        : '还没有设置每周目标，点下面调整'}</div>
      <div class="hero-bar"><i style="width:${weekly.target > 0 ? weekly.pct : 0}%"></i></div>
      <div class="hero-foot">
        <span>${weekRange(weekly.startKey, weekly.endKey)} · 还剩 ${weekly.daysLeft} 天</span>
        <button type="button" class="hero-link" data-goal-edit="weeklyGoalMin">调整 →</button>
      </div>
    </section>

    <section class="goal-duo fade-in">
      ${goalCard('dailyGoalMin', '☀️', '今日目标', daily, '完成度 ' + daily.pct + '%')}
      ${goalCard('monthlyGoalMin', '🗓️', '本月目标', monthly, '本月已过 ' + monthly.elapsedDays + '/' + monthly.totalDays + ' 天')}
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>最近 12 周</h3><span class="more">达成 ${metWeeks}/12 周</span></div>
      <div class="goal-weeks">
        ${weeks.map(weekRow).join('')}
      </div>
      <p class="hint mt12">每周累计时长对比每周目标 · 深色表示这一周已达成</p>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>每日达标</h3><span class="more">最近 12 周 · ${dailyHist.hits} 天</span></div>
      <div class="goal-heat" role="img" aria-label="最近 12 周每日目标达成情况">
        ${dailyHist.cells.map((c) => '<span class="goal-day l' + c.level + (c.future ? ' future' : '') + '" data-day="' + c.key + '" title="' + c.key + ' · ' + fmtMinShort(c.minutes) + '"></span>').join('')}
      </div>
      <p class="goal-legend"><span>少</span><i class="goal-day l1"></i><i class="goal-day l2"></i><i class="goal-day l3"></i><span>多 / 达成</span></p>
      <p class="hint">颜色越深表示当天离每日目标越近，达到目标即点亮。</p>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>目标设置</h3><span class="more">点击调整</span></div>
      ${settingRow('dailyGoalMin', '☀️', '每日目标', '每天想学习多久', daily.target, false)}
      ${settingRow('weeklyGoalMin', '📅', '每周目标', '一周累计学习时长', weekly.target, true)}
      ${settingRow('monthlyGoalMin', '🗓️', '每月目标', '一个月累计学习时长', monthly.target, true)}
    </section>
  `;

  function mount(root) {
    root.querySelectorAll('[data-goal-edit], [data-goal-set]').forEach((el) => {
      el.addEventListener('click', () => openGoalSheet(el.dataset.goalEdit || el.dataset.goalSet, ctx));
    });
  }

  return { title: '学习目标', sub: '看见每天的积累', html, mount };
}

function openGoalSheet(key, ctx) {
  const cfg = GOAL_CFG[key];
  if (!cfg) return;
  const cur = Number(getState().settings[key]) || 0;
  const raw = cfg.hours ? Math.round((cur / 60) * 10) / 10 : cur;
  openSheet(`
    <h2 class="sheet-title">${cfg.title}</h2>
    <p class="sheet-desc">${cfg.desc}</p>
    <div class="field">
      <label for="goal-input">目标（${cfg.unit}）</label>
      <input class="input" id="goal-input" type="number" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${raw}" />
    </div>
    <div class="chips" id="goal-presets">
      ${cfg.presets.map((n) => '<button class="chip" type="button" data-preset="' + n + '">' + n + (cfg.hours ? 'h' : '') + '</button>').join('')}
    </div>
    ${cfg.hours ? '<p class="sheet-desc">填 0 表示暂时不设这个目标。</p>' : ''}
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="cancel">取消</button>
      <button class="btn primary" type="button" data-act="ok">保存</button>
    </div>
  `, (sheet) => {
    const input = sheet.querySelector('#goal-input');
    sheet.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.preset;
        sheet.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('on', x === btn));
      });
    });
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v < cfg.min || v > cfg.max) {
        toast('请输入 ' + cfg.min + ' - ' + cfg.max + ' ' + cfg.unit);
        return;
      }
      const stored = cfg.hours ? Math.round(v * 60) : Math.round(v);
      const saved = setGoal(key, stored);
      if (saved == null) { toast('保存失败'); return; }
      closeSheet();
      haptic();
      toast('已保存');
      ctx.refresh();
    });
  });
}
