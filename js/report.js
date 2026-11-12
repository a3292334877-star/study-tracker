/* 周报：文字总结 + Canvas 海报卡片导出 */
import { getState, getSubject, dateKey, addDays, startOfWeek, parseKey } from './store.js';
import { fmtMinShort, fmtMin } from './util.js';

export function weekData(weekStart = 1, ref = new Date()) {
  const state = getState();
  const start = startOfWeek(ref, weekStart);
  const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
  const keySet = new Set(keys);
  const inRange = state.sessions.filter((s) => keySet.has(dateKey(new Date(s.end))));
  const totalMin = inRange.reduce((sum, s) => sum + s.minutes, 0);
  const activeDays = new Set(inRange.map((s) => dateKey(new Date(s.end)))).size;

  const bySubject = new Map();
  inRange.forEach((s) => {
    const id = s.subjectId || '__none';
    bySubject.set(id, (bySubject.get(id) || 0) + s.minutes);
  });
  const subjects = [...bySubject.entries()]
    .map(([id, min]) => {
      const sub = getSubject(id);
      return {
        id,
        name: sub?.name || '未分类',
        emoji: sub?.emoji || '📘',
        color: sub?.color || '#98a0b3',
        min,
        goalMinWeek: sub?.goalMinWeek || 0,
      };
    })
    .sort((a, b) => b.min - a.min);

  /* 学了什么：取本周记录里最常出现的内容标题，去重取前 6 */
  const titleCount = new Map();
  inRange.forEach((s) => {
    const t = (s.title || '').trim();
    if (!t) return;
    titleCount.set(t, (titleCount.get(t) || 0) + 1);
  });
  const highlights = [...titleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t);

  const first = parseKey(keys[0]);
  const last = parseKey(keys[6]);
  return {
    start,
    end: last,
    rangeText: `${first.getMonth() + 1}月${first.getDate()}日 - ${last.getMonth() + 1}月${last.getDate()}日`,
    totalMin,
    count: inRange.length,
    activeDays,
    avg: activeDays ? Math.round(totalMin / activeDays) : 0,
    subjects,
    highlights,
    goalMet: subjects.filter((s) => s.goalMinWeek > 0 && s.min >= s.goalMinWeek).length,
    goalTotal: subjects.filter((s) => s.goalMinWeek > 0).length,
  };
}

/* 文字版总结：适合复制到微信群 / 笔记 */
export function weeklyText(d) {
  const lines = [];
  lines.push('📚 我的学习周报');
  lines.push(`📅 ${d.rangeText}`);
  lines.push('');
  lines.push(`⏱ 累计学习 ${fmtMinShort(d.totalMin)} · ${d.count} 条记录 · 学习 ${d.activeDays} 天`);
  if (d.goalTotal > 0) lines.push(`🎯 周目标达成 ${d.goalMet}/${d.goalTotal} 个科目`);
  if (d.subjects.length) {
    lines.push('');
    lines.push('📖 科目分布：');
    d.subjects.slice(0, 5).forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.emoji} ${s.name}：${fmtMinShort(s.min)}`);
    });
  }
  if (d.highlights.length) {
    lines.push('');
    lines.push('✏️ 本周学了：');
    d.highlights.forEach((t) => lines.push(`  · ${t}`));
  }
  lines.push('');
  lines.push('—— 来自「学习记录」App');
  return lines.join('\n');
}

/* Canvas 海报：2x 高清竖版卡片，高度按内容自适应，不重叠 */
export function drawWeeklyPoster(canvas, d) {
  const F = '"PingFang SC","Microsoft YaHei",sans-serif';
  const W = 750;
  const scale = 2;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const IN_X = CARD_X + 40;
  const IN_W = CARD_W - 80;
  const CARD_Y = 210;
  const SEC_HEAD = 46;
  const ROW_H = 72;
  const HL_H = 42;

  const goals = d.goalTotal > 0 ? d.subjects.filter((s) => s.goalMinWeek > 0) : [];
  const dist = d.subjects.slice(0, 5);
  const highlights = d.highlights.slice(0, 5);

  /* 先按内容算高度，再定画布与卡片尺寸 */
  const sections = [];
  sections.push({ kind: 'hero', h: 200 });
  sections.push({ kind: 'stats', h: 168 });
  if (goals.length) sections.push({ kind: 'goal', h: SEC_HEAD + goals.length * ROW_H + 16 });
  if (dist.length) sections.push({ kind: 'dist', h: SEC_HEAD + dist.length * ROW_H + 8 });
  if (highlights.length) sections.push({ kind: 'hl', h: SEC_HEAD + highlights.length * HL_H + 12 });

  const contentH = sections.reduce((sum, s) => sum + s.h, 0);
  const CARD_H = 34 + contentH + 30;
  const H = CARD_Y + CARD_H + 120;

  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  /* 背景 */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#4f6df5');
  bg.addColorStop(0.55, '#7d5cff');
  bg.addColorStop(1, '#5b4bd8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* 装饰圆 */
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(660, 96, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  /* 头部（渐变区，卡片之上） */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('我 的 学 习 周 报', W / 2, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${F}`;
  ctx.fillText(d.rangeText, W / 2, 140);

  /* 白色卡片 */
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();

  let y = CARD_Y + 34;

  sections.forEach((sec) => {
    if (sec.kind === 'hero') {
      const t = fmtMin(d.totalMin);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 24px ${F}`;
      ctx.fillText('累计学习', W / 2, y + 28);

      ctx.font = `800 92px ${F}`;
      const vw = ctx.measureText(t.value).width;
      ctx.font = `500 34px ${F}`;
      const uw = ctx.measureText(t.unit).width;
      const totalW = vw + 12 + uw;
      const left = W / 2 - totalW / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `800 92px ${F}`;
      ctx.fillText(t.value, left, y + 150);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 34px ${F}`;
      ctx.fillText(t.unit, left + vw + 12, y + 150);
    } else if (sec.kind === 'stats') {
      const stats = [
        [String(d.count), '学习记录'],
        [String(d.activeDays), '学习天数'],
        [fmtMinShort(d.avg), '日均时长'],
      ];
      const gap = 14;
      const bw = (IN_W - gap * 2) / 3;
      stats.forEach(([v, label], i) => {
        const bx = IN_X + i * (bw + gap);
        ctx.fillStyle = '#f4f6fb';
        roundRect(ctx, bx, y, bw, 128, 22);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `700 44px ${F}`;
        ctx.fillText(v, bx + bw / 2, y + 62);
        ctx.fillStyle = '#6b7280';
        ctx.font = `400 24px ${F}`;
        ctx.fillText(label, bx + bw / 2, y + 102);
      });
    } else if (sec.kind === 'goal') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('🎯 周目标达成', IN_X, y + 30);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#4f6df5';
      ctx.font = `700 30px ${F}`;
      ctx.fillText(`${d.goalMet}/${d.goalTotal} 个科目`, IN_X + IN_W, y + 30);

      let r = y + SEC_HEAD;
      goals.forEach((s) => {
        const pct = Math.min(100, Math.round((s.min / s.goalMinWeek) * 100));
        ctx.textAlign = 'left';
        ctx.fillStyle = '#374151';
        ctx.font = `500 26px ${F}`;
        ctx.fillText(`${s.emoji} ${s.name}`, IN_X, r + 28);
        ctx.textAlign = 'right';
        ctx.fillStyle = pct >= 100 ? '#12b76a' : '#6b7280';
        ctx.fillText(`${fmtMinShort(s.min)} · ${pct}%`, IN_X + IN_W, r + 28);
        drawBar(ctx, IN_X, r + 42, IN_W, 12, pct / 100, pct >= 100 ? '#12b76a' : s.color);
        r += ROW_H;
      });
    } else if (sec.kind === 'dist') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('📚 科目分布', IN_X, y + 30);

      const maxMin = Math.max(1, ...dist.map((s) => s.min));
      let r = y + SEC_HEAD;
      dist.forEach((s) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#374151';
        ctx.font = `500 26px ${F}`;
        ctx.fillText(`${s.emoji} ${s.name}`, IN_X, r + 28);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(fmtMinShort(s.min), IN_X + IN_W, r + 28);
        drawBar(ctx, IN_X, r + 42, IN_W, 12, s.min / maxMin, s.color);
        r += ROW_H;
      });
    } else if (sec.kind === 'hl') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('✏️ 本周学了', IN_X, y + 30);

      let r = y + SEC_HEAD;
      highlights.forEach((hl) => {
        ctx.fillStyle = '#4b5563';
        ctx.font = `400 26px ${F}`;
        const text = hl.length > 16 ? hl.slice(0, 15) + '…' : hl;
        ctx.fillText('· ' + text, IN_X + 4, r + 30);
        r += HL_H;
      });
    }
    y += sec.h;
  });

  /* 底部水印 */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 24px ${F}`;
  ctx.fillText('记录 · 坚持 · 成长 —— 来自「学习记录」', W / 2, H - 52);

  ctx.restore();
  return canvas;
}

/* 打卡分享卡：构图沿用周报海报（先按内容算高度、圆角白卡、渐变底、固定安全边距）
   data: { streak, longest, totalMin, days:[{key,date,minutes}] } */
export function drawStreakCard(canvas, d) {
  const F = '"PingFang SC","Microsoft YaHei",sans-serif';
  const W = 750;
  const scale = 2;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const IN_X = CARD_X + 40;
  const IN_W = CARD_W - 80;
  const CARD_Y = 210;
  const SEC_HEAD = 46;
  const CHART_H = 200;
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

  const days = (Array.isArray(d.days) ? d.days : []).slice(-7);
  const streakDays = Math.max(0, Math.round(Number(d.streak) || 0));
  const longest = Math.max(streakDays, Math.round(Number(d.longest) || 0));
  const totalMin = Math.max(0, Math.round(Number(d.totalMin) || 0));

  /* 先按内容算高度，再定画布与卡片尺寸 */
  const sections = [];
  sections.push({ kind: 'hero', h: 210 });
  sections.push({ kind: 'stats', h: 168 });
  if (days.length) sections.push({ kind: 'week', h: SEC_HEAD + CHART_H + 10 });

  const contentH = sections.reduce((sum, s) => sum + s.h, 0);
  const CARD_H = 34 + contentH + 30;
  const H = CARD_Y + CARD_H + 120;

  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  /* 背景：与周报海报同一套渐变 + 装饰圆 */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#4f6df5');
  bg.addColorStop(0.55, '#7d5cff');
  bg.addColorStop(1, '#5b4bd8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(660, 96, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  /* 头部（渐变区，卡片之上） */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('我 的 连 续 打 卡', W / 2, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${F}`;
  ctx.fillText('每天一点点，也算数', W / 2, 140);

  /* 白色卡片 */
  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();

  let y = CARD_Y + 34;

  sections.forEach((sec) => {
    if (sec.kind === 'hero') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 24px ${F}`;
      ctx.fillText('连续打卡', W / 2, y + 28);

      /* 大数字 + 单位（量宽后居中，和海报里的时长排版一致） */
      const num = String(streakDays);
      ctx.font = `800 92px ${F}`;
      const nw = ctx.measureText(num).width;
      ctx.font = `500 34px ${F}`;
      const uw = ctx.measureText('天').width;
      const left = W / 2 - (nw + 12 + uw) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `800 92px ${F}`;
      ctx.fillText(num, left, y + 150);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 34px ${F}`;
      ctx.fillText('天', left + nw + 12, y + 150);
    } else if (sec.kind === 'stats') {
      const stats = [
        [`${longest} 天`, '最长连续'],
        [fmtMinShort(totalMin), '累计学习'],
      ];
      const gap = 14;
      const bw = (IN_W - gap) / 2;
      stats.forEach(([v, label], i) => {
        const bx = IN_X + i * (bw + gap);
        ctx.fillStyle = '#f4f6fb';
        roundRect(ctx, bx, y, bw, 128, 22);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `700 44px ${F}`;
        ctx.fillText(v, bx + bw / 2, y + 62);
        ctx.fillStyle = '#6b7280';
        ctx.font = `400 24px ${F}`;
        ctx.fillText(label, bx + bw / 2, y + 102);
      });
    } else if (sec.kind === 'week') {
      /* 最近 7 天迷你柱状 */
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('最近 7 天', IN_X, y + 30);

      const n = days.length;
      const gapB = 12;
      const bw = (IN_W - gapB * (n - 1)) / n;
      const baseY = y + SEC_HEAD + 150;
      const maxMin = Math.max(1, ...days.map((x) => Number(x.minutes) || 0));
      days.forEach((day, i) => {
        const min = Math.max(0, Math.round(Number(day.minutes) || 0));
        const bh = min > 0 ? Math.max(12, Math.round((min / maxMin) * 96)) : 6;
        const bx = IN_X + i * (bw + gapB);
        const dt = day.date ? new Date(day.date) : parseKey(day.key);
        ctx.fillStyle = min > 0 ? '#4f6df5' : '#eef0f7';
        roundRect(ctx, bx, baseY - bh, bw, bh, Math.min(10, bw / 2));
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = min > 0 ? '#6b7280' : '#c2c8d6';
        ctx.font = `500 24px ${F}`;
        ctx.fillText(WEEK_CN[dt.getDay()], bx + bw / 2, baseY + 34);
        if (min > 0) {
          /* 数值标签贴在柱顶上方 14px，柱高上限 96 保证不会顶到小标题 */
          ctx.fillStyle = '#9aa1b2';
          ctx.font = `500 20px ${F}`;
          ctx.fillText(fmtMinShort(min), bx + bw / 2, baseY - bh - 14);
        }
      });
    }
    y += sec.h;
  });

  /* 底部水印 */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 24px ${F}`;
  ctx.fillText('记录 · 坚持 · 成长 —— 来自「学习记录」', W / 2, H - 52);

  ctx.restore();
  return canvas;
}

/* 打卡卡文件名：打卡卡-连续N天.png */
export function streakFilename(d) {
  const n = Math.max(0, Math.round(Number(d && d.streak) || 0));
  return `打卡卡-连续${n}天.png`;
}

/* 年度海报（v1.14）：2x 竖版长图，月度柱 + 科目排行 + 年度标签 */
export function drawYearPoster(canvas, d) {
  const F = '"PingFang SC","Microsoft YaHei",sans-serif';
  const W = 750;
  const scale = 2;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const IN_X = CARD_X + 40;
  const IN_W = CARD_W - 80;
  const CARD_Y = 210;
  const SEC_HEAD = 46;
  const ROW_H = 64;

  const subs = d.subjects.slice(0, 4);
  const sections = [];
  sections.push({ kind: 'hero', h: 190 });
  sections.push({ kind: 'stats', h: 150 });
  sections.push({ kind: 'month', h: SEC_HEAD + 170 });
  if (subs.length) sections.push({ kind: 'subs', h: SEC_HEAD + subs.length * ROW_H + 8 });
  if (d.tags.length) sections.push({ kind: 'tags', h: SEC_HEAD + 46 });

  const contentH = sections.reduce((sum, s) => sum + s.h, 0);
  const CARD_H = 34 + contentH + 30;
  const H = CARD_Y + CARD_H + 120;

  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#4f6df5');
  bg.addColorStop(0.55, '#7d5cff');
  bg.addColorStop(1, '#5b4bd8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(660, 96, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('我 的 年 度 回 顾', W / 2, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${F}`;
  ctx.fillText(d.year + ' 年', W / 2, 140);

  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();

  let y = CARD_Y + 34;

  sections.forEach((sec) => {
    if (sec.kind === 'hero') {
      const t = fmtMin(d.totalMin);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 26px ${F}`;
      ctx.fillText('年 度 累 计 学 习', W / 2, y + 34);
      const nw = (ctx.font = `800 88px ${F}`, ctx.measureText(t.value).width);
      ctx.font = `500 34px ${F}`;
      const uw = ctx.measureText(t.unit).width;
      const left = W / 2 - (nw + 10 + uw) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `800 88px ${F}`;
      ctx.fillText(t.value, left, y + 140);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 34px ${F}`;
      ctx.fillText(t.unit, left + nw + 10, y + 140);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `400 24px ${F}`;
      ctx.fillText(d.count + ' 条记录 · 学习 ' + d.activeDays + ' 天', W / 2, y + 178);
    } else if (sec.kind === 'stats') {
      const cells = [
        [d.activeDays + ' 天', '学习天数'],
        [d.longest + ' 天', '最长连续'],
        [fmtMinShort(d.bestDay ? d.bestDay.min : 0), '最佳单日'],
      ];
      const gap = 12;
      const bw = (IN_W - gap * 2) / 3;
      cells.forEach(([v, label], i) => {
        const bx = IN_X + i * (bw + gap);
        ctx.fillStyle = '#f4f6fb';
        roundRect(ctx, bx, y, bw, 118, 22);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `700 36px ${F}`;
        ctx.fillText(v, bx + bw / 2, y + 56);
        ctx.fillStyle = '#6b7280';
        ctx.font = `400 22px ${F}`;
        ctx.fillText(label, bx + bw / 2, y + 94);
      });
    } else if (sec.kind === 'month') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('月度节奏', IN_X, y + 30);
      const n = 12;
      const gapB = 10;
      const bw = (IN_W - gapB * (n - 1)) / n;
      const baseY = y + SEC_HEAD + 132;
      const maxMin = Math.max(1, ...d.byMonth.map((m) => m.min));
      d.byMonth.forEach((m, i) => {
        const bh = m.min > 0 ? Math.max(14, Math.round((m.min / maxMin) * 104)) : 6;
        const bx = IN_X + i * (bw + gapB);
        ctx.fillStyle = m.min > 0 ? '#4f6df5' : '#eef0f7';
        roundRect(ctx, bx, baseY - bh, bw, bh, Math.min(8, bw / 2));
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = m.min > 0 ? '#6b7280' : '#c2c8d6';
        ctx.font = `500 20px ${F}`;
        ctx.fillText(String(i + 1), bx + bw / 2, baseY + 26);
      });
    } else if (sec.kind === 'subs') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('科目排行', IN_X, y + 30);
      const maxSub = Math.max(1, ...subs.map((s) => s.min));
      subs.forEach((s, i) => {
        const ry = y + SEC_HEAD + i * ROW_H;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `500 26px ${F}`;
        ctx.fillText((s.emoji || '📘') + ' ' + s.name, IN_X, ry + 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = `500 24px ${F}`;
        ctx.fillText(fmtMinShort(s.min), IN_X + IN_W, ry + 30);
        drawBar(ctx, IN_X, ry + 42, IN_W, 12, s.min / maxSub, s.color || '#4f6df5');
      });
    } else if (sec.kind === 'tags') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('常用标签', IN_X, y + 30);
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 26px ${F}`;
      const txt = d.tags.slice(0, 6).map((t) => '#' + t.name).join('   ');
      ctx.fillText(txt, IN_X, y + 74, IN_W);
    }
    y += sec.h;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 24px ${F}`;
  ctx.fillText('记录 · 坚持 · 成长 —— 来自「学习记录」', W / 2, H - 52);

  ctx.restore();
  return canvas;
}

/* 月度海报（v1.26）：2x 竖版长图，本月日历 + 科目排行 + 月度目标 */
export function drawMonthPoster(canvas, d) {
  const F = '"PingFang SC","Microsoft YaHei",sans-serif';
  const W = 750;
  const scale = 2;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const IN_X = CARD_X + 40;
  const IN_W = CARD_W - 80;
  const CARD_Y = 210;
  const SEC_HEAD = 46;
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  const CELL_H = 46;
  const CELL_GAP = 8;
  const subs = (d.subjects || []).slice(0, 4);
  const weekStart = Number(d.weekStart) === 0 ? 0 : 1;
  const offset = (new Date(d.year, d.month, 1).getDay() - weekStart + 7) % 7;
  const weeks = Math.ceil((offset + d.dim) / 7);
  const gridH = weeks * CELL_H + (weeks - 1) * CELL_GAP;
  const calH = SEC_HEAD + 26 + gridH + 28;

  const sections = [];
  sections.push({ kind: 'hero', h: 188 });
  sections.push({ kind: 'stats', h: 142 });
  sections.push({ kind: 'calendar', h: calH });
  if (subs.length) sections.push({ kind: 'subs', h: SEC_HEAD + subs.length * 60 + 6 });
  if (d.tags && d.tags.length) sections.push({ kind: 'tags', h: 70 });

  const contentH = sections.reduce((sum, s) => sum + s.h, 0);
  const CARD_H = 34 + contentH + 30;
  const H = CARD_Y + CARD_H + 120;

  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#4f6df5');
  bg.addColorStop(0.55, '#7d5cff');
  bg.addColorStop(1, '#5b4bd8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(660, 96, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('我 的 学 习 月 报', W / 2, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${F}`;
  ctx.fillText(d.label, W / 2, 140);

  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();

  let y = CARD_Y + 34;

  sections.forEach((sec) => {
    if (sec.kind === 'hero') {
      const t = fmtMin(d.totalMin);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 26px ${F}`;
      ctx.fillText('本 月 累 计 学 习', W / 2, y + 30);
      const nw = (ctx.font = `800 88px ${F}`, ctx.measureText(t.value).width);
      ctx.font = `500 34px ${F}`;
      const uw = ctx.measureText(t.unit).width;
      const left = W / 2 - (nw + 10 + uw) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `800 88px ${F}`;
      ctx.fillText(t.value, left, y + 136);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 34px ${F}`;
      ctx.fillText(t.unit, left + nw + 10, y + 136);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `400 24px ${F}`;
      ctx.fillText(d.count + ' 条记录 · 学习 ' + d.activeDays + ' 天 · 平均每学 ' + fmtMinShort(d.avgPerActive), W / 2, y + 174);
    } else if (sec.kind === 'stats') {
      const cells = [
        [d.activeDays + ' 天', '学习天数'],
        [d.goalMetDays + ' 天', '目标达标'],
        [d.longest + ' 天', '最长连续'],
      ];
      const gap = 12;
      const bw = (IN_W - gap * 2) / 3;
      cells.forEach(([v, label], i) => {
        const bx = IN_X + i * (bw + gap);
        ctx.fillStyle = '#f4f6fb';
        roundRect(ctx, bx, y, bw, 112, 22);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `700 36px ${F}`;
        ctx.fillText(v, bx + bw / 2, y + 54);
        ctx.fillStyle = '#6b7280';
        ctx.font = `400 22px ${F}`;
        ctx.fillText(label, bx + bw / 2, y + 90);
      });
    } else if (sec.kind === 'calendar') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('本月日历', IN_X, y + 30);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `400 22px ${F}`;
      ctx.fillText(d.activeDays + ' 天有记录', IN_X + IN_W, y + 30);

      const cellW = (IN_W - CELL_GAP * 6) / 7;
      const headY = y + SEC_HEAD + 4;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 18px ${F}`;
      for (let i = 0; i < 7; i += 1) {
        ctx.fillText(WEEK_CN[(weekStart + i) % 7], IN_X + i * (cellW + CELL_GAP) + cellW / 2, headY + 16);
      }
      const colors = ['#eef0f7', '#dfe4ff', '#b9c4ff', '#8598fa', '#4f6df5'];
      const gridY = headY + 28;
      d.byDay.forEach((day, i) => {
        const pos = offset + i;
        const row = Math.floor(pos / 7);
        const col = pos % 7;
        const bx = IN_X + col * (cellW + CELL_GAP);
        const by = gridY + row * (CELL_H + CELL_GAP);
        ctx.fillStyle = colors[day.level] || colors[0];
        roundRect(ctx, bx, by, cellW, CELL_H, 10);
        ctx.fill();
        if (day.goalMet) {
          ctx.strokeStyle = '#12b76a';
          ctx.lineWidth = 3;
          roundRect(ctx, bx + 1.5, by + 1.5, cellW - 3, CELL_H - 3, 9);
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = day.level >= 2 ? '#ffffff' : (day.minutes > 0 ? '#4f6df5' : '#c2c8d6');
        ctx.font = `600 20px ${F}`;
        ctx.fillText(String(day.day), bx + cellW / 2, by + CELL_H / 2 + 7);
      });
    } else if (sec.kind === 'subs') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('科目排行', IN_X, y + 30);
      const maxSub = Math.max(1, ...subs.map((s) => s.min));
      subs.forEach((s, i) => {
        const ry = y + SEC_HEAD + i * 60;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `500 26px ${F}`;
        ctx.fillText((s.emoji || '📘') + ' ' + s.name, IN_X, ry + 28);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = `500 24px ${F}`;
        ctx.fillText(fmtMinShort(s.min), IN_X + IN_W, ry + 28);
        drawBar(ctx, IN_X, ry + 40, IN_W, 12, s.min / maxSub, s.color || '#4f6df5');
      });
    } else if (sec.kind === 'tags') {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `600 30px ${F}`;
      ctx.fillText('常用标签', IN_X, y + 30);
      ctx.fillStyle = '#6b7280';
      ctx.font = `400 25px ${F}`;
      const txt = d.tags.slice(0, 6).map((t) => '#' + t.name).join('   ');
      ctx.fillText(txt, IN_X, y + 66, IN_W);
    }
    y += sec.h;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 24px ${F}`;
  ctx.fillText('记录 · 坚持 · 成长 —— 来自「学习记录」', W / 2, H - 52);

  ctx.restore();
  return canvas;
}

/* 成就卡（v1.15）：把已点亮的徽章排成一张可保存的分享卡 */
export function drawAchievementPoster(canvas, s) {
  const F = '"PingFang SC","Microsoft YaHei",sans-serif';
  const W = 750;
  const scale = 2;
  const CARD_X = 40;
  const CARD_W = W - 80;
  const IN_X = CARD_X + 40;
  const IN_W = CARD_W - 80;
  const CARD_Y = 210;
  const CELL_H = 138;
  const GAP = 15;

  const got = (s.items || []).filter((x) => x.unlocked).slice(0, 12);
  const rows = Math.ceil(got.length / 3);
  const sections = [];
  sections.push({ kind: 'hero', h: 170 });
  if (got.length) sections.push({ kind: 'grid', h: rows * CELL_H + (rows - 1) * GAP + 18 });
  else sections.push({ kind: 'none', h: 190 });

  const contentH = sections.reduce((sum, x) => sum + x.h, 0);
  const CARD_H = 34 + contentH + 30;
  const H = CARD_Y + CARD_H + 120;

  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#4f6df5');
  bg.addColorStop(0.55, '#7d5cff');
  bg.addColorStop(1, '#5b4bd8');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(660, 96, 170, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 130, 150, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `500 26px ${F}`;
  ctx.fillText('我 的 成 就 墙', W / 2, 78);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${F}`;
  ctx.fillText('每一步，都算数', W / 2, 140);

  roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fill();

  let y = CARD_Y + 34;

  sections.forEach((sec) => {
    if (sec.kind === 'hero') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `500 26px ${F}`;
      ctx.fillText('已 点 亮 徽 章', W / 2, y + 36);
      const num = String(s.unlocked);
      ctx.font = `800 82px ${F}`;
      const nw = ctx.measureText(num).width;
      const tail = ' / ' + s.total + ' 枚';
      ctx.font = `500 32px ${F}`;
      const tw = ctx.measureText(tail).width;
      const left = W / 2 - (nw + tw) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1d2e';
      ctx.font = `800 82px ${F}`;
      ctx.fillText(num, left, y + 128);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 32px ${F}`;
      ctx.fillText(tail, left + nw, y + 128);
    } else if (sec.kind === 'grid') {
      const cellW = (IN_W - GAP * 2) / 3;
      got.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const bx = IN_X + col * (cellW + GAP);
        const by = y + row * (CELL_H + GAP);
        ctx.fillStyle = '#f4f6fb';
        roundRect(ctx, bx, by, cellW, CELL_H, 22);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = `42px ${F}`;
        ctx.fillText(item.icon, bx + cellW / 2, by + 52);
        ctx.fillStyle = '#1a1d2e';
        ctx.font = `600 23px ${F}`;
        ctx.fillText(item.title, bx + cellW / 2, by + 92);
        ctx.fillStyle = '#9aa1b2';
        ctx.font = `400 19px ${F}`;
        const desc = item.desc.length > 10 ? item.desc.slice(0, 9) + '…' : item.desc;
        ctx.fillText(desc, bx + cellW / 2, by + 120);
      });
    } else if (sec.kind === 'none') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa1b2';
      ctx.font = `56px ${F}`;
      ctx.fillText('🌱', W / 2, y + 82);
      ctx.fillStyle = '#6b7280';
      ctx.font = `500 28px ${F}`;
      ctx.fillText('还没有点亮徽章，从第一条记录开始吧', W / 2, y + 140);
    }
    y += sec.h;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 24px ${F}`;
  ctx.fillText('记录 · 坚持 · 成长 —— 来自「学习记录」', W / 2, H - 52);

  ctx.restore();
  return canvas;
}

function drawBar(ctx, x, y, w, h, ratio, color) {
  ctx.fillStyle = '#eef0f7';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const r = Math.max(0, Math.min(1, ratio || 0));
  if (r > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(h, w * r), h, h / 2);
    ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function posterFilename(d) {
  return `学习周报-${d.rangeText.replace(/[\s-]/g, '')}.png`;
}
