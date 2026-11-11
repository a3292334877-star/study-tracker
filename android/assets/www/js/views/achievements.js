/* 成就徽章（v1.15）：把长期积累折算成一面成就墙 + 可分享的成就卡 */
import { achievementStats } from '../store.js';
import { esc, fmtMinShort, openSheet, closeSheet, toast, haptic } from '../util.js';
import { drawAchievementPoster } from '../report.js';

const GROUP_ORDER = ['入门', '坚持', '多元', '专注'];

function progressText(item) {
  if (!item.unit) return item.unlocked ? '已达成' : '未达成';
  const shown = Math.min(item.value, item.target);
  if (item.unit === '分钟') return fmtMinShort(shown) + ' / ' + fmtMinShort(item.target);
  return shown + ' / ' + item.target + ' ' + item.unit;
}

export function achievementText(s) {
  const lines = [];
  lines.push('🏅 我的成就墙');
  lines.push('已点亮 ' + s.unlocked + ' / ' + s.total + ' 枚徽章');
  const got = s.items.filter((x) => x.unlocked);
  if (got.length) {
    lines.push('');
    got.forEach((x) => lines.push('  ' + x.icon + ' ' + x.title + ' · ' + x.desc));
  } else {
    lines.push('');
    lines.push('还没有点亮徽章，从第一条学习记录开始吧');
  }
  lines.push('');
  lines.push('—— 来自「学习记录」App');
  return lines.join('\n');
}

export function renderAchievements(ctx) {
  const s = achievementStats();
  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    items: s.items.filter((x) => x.group === g),
  })).filter((g) => g.items.length);

  const grid = groups.map((g) => `
    <div class="section-label">${esc(g.name)}</div>
    <div class="ach-grid fade-in">
      ${g.items.map((x) => `
        <div class="ach${x.unlocked ? ' on' : ''}" data-badge="${x.id}" title="${esc(x.desc)}">
          <div class="ach-ic">${x.icon}</div>
          <div class="ach-title">${esc(x.title)}</div>
          <div class="ach-desc">${esc(x.desc)}</div>
          <div class="ach-bar"><i style="width:${x.pct}%"></i></div>
          <div class="ach-prog">${progressText(x)}</div>
        </div>`).join('')}
    </div>`).join('');

  const html = `
    <section class="hero fade-in" style="margin-top:8px">
      <div class="hero-label">成就点亮</div>
      <div class="hero-value" id="ach-unlocked" aria-live="polite"><b>${s.unlocked}</b><span>/ ${s.total} 枚</span></div>
      <div class="hero-sub">${s.unlocked === 0 ? '还没有点亮徽章，从第一条记录开始' : '保持记录，一枚一枚点亮它们'}</div>
      <div class="hero-bar"><i style="width:${s.percent}%"></i></div>
      <div class="hero-foot"><span>点亮进度 ${s.percent}%</span><span>${s.unlocked} / ${s.total}</span></div>
    </section>

    <section class="card fade-in">
      <div class="card-title"><h3>分享成就</h3><span class="more">做成一张卡片</span></div>
      <p class="hint" style="margin:0 0 14px">把已经点亮的徽章做成一张图，留存或分享都很方便。</p>
      <div style="display:flex;gap:10px">
        <button class="btn primary" type="button" data-act="ach-poster" style="flex:1">🖼️ 成就卡</button>
        <button class="btn" type="button" data-act="ach-text" style="flex:1">📋 复制文字</button>
      </div>
    </section>

    ${grid}
  `;

  function mount(root) {
    const posterBtn = root.querySelector('[data-act="ach-poster"]');
    if (posterBtn) posterBtn.addEventListener('click', openPoster);
    const textBtn = root.querySelector('[data-act="ach-text"]');
    if (textBtn) textBtn.addEventListener('click', copyText);
  }

  function openPoster() {
    haptic();
    openSheet(`
      <h2 class="sheet-title">我的成就卡</h2>
      <p class="sheet-desc">长按或保存下面的图片即可分享。</p>
      <div style="display:flex;justify-content:center">
        <canvas id="ach-canvas" style="width:100%;max-width:300px;height:auto;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.18)"></canvas>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">关闭</button>
        <button class="btn primary" type="button" data-act="save-img">保存图片</button>
      </div>`, (sheet) => {
      const canvas = sheet.querySelector('#ach-canvas');
      drawAchievementPoster(canvas, s);
      sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="save-img"]').addEventListener('click', () => {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const name = '成就卡-' + s.unlocked + '枚.png';
          if (window.AndroidApp && window.AndroidApp.saveImage) {
            const ok = window.AndroidApp.saveImage(name, dataUrl);
            toast(ok ? '成就卡已保存到相册' : '保存失败，请重试');
            if (ok) closeSheet();
            return;
          }
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast('成就卡已保存');
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
    const text = achievementText(s);
    const done = () => toast('已复制成就文字');
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

  return { title: '成就', sub: `已点亮 ${s.unlocked} / ${s.total} 枚徽章`, html, mount };
}
