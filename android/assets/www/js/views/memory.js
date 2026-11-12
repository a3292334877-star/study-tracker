/* 笔记回顾（v1.21）：把写过心得的记录按间隔重复出现 */
import {
  reviewQueue, reviewNoteList, reviewStats, markReviewed, getSubject,
} from '../store.js';
import {
  esc, haptic, toast, dateKey, parseKey, monthDayCN, weekdayCN,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';

const DAY = 24 * 60 * 60 * 1000;

function dateLabel(ts) {
  const d = new Date(ts);
  return `${monthDayCN(d)} ${weekdayCN(d)}`;
}

function dueLabel(info, now) {
  if (info.due) return '今天该回顾';
  const days = Math.max(1, Math.ceil((info.dueAt - now) / DAY));
  if (days === 1) return '明天回顾';
  return `${days} 天后回顾`;
}

function noteHtml(note) {
  return esc(note).replace(/\n/g, '<br/>');
}

function subjectMeta(session) {
  const subject = session.subjectId ? getSubject(session.subjectId) : null;
  return {
    name: subject ? esc(subject.name) : '未分类',
    color: subject ? subject.color : 'var(--primary)',
  };
}

function reviewCard(item, now) {
  const { session, info } = item;
  const meta = subjectMeta(session);
  return `<article class="card memory-card fade-in" data-review-id="${session.id}">
    <div class="memory-meta">
      <span class="memory-dot" style="background:${meta.color}"></span>
      <span>${meta.name}</span>
      <span class="memory-sep">·</span>
      <span>${dateLabel(session.end)}</span>
      <span class="memory-sep">·</span>
      <span>第 ${info.count + 1} 次回顾</span>
    </div>
    <h3 class="memory-title">${esc(session.title || '学习记录')}</h3>
    <p class="memory-note">${noteHtml(session.note)}</p>
    <div class="memory-actions">
      <span class="memory-due">${dueLabel(info, now)}</span>
      <button class="btn primary memory-mark" type="button" data-mark="${session.id}">想起来了，下次再见</button>
    </div>
  </article>`;
}

export function renderMemory(ctx) {
  const now = Date.now();
  const queue = reviewQueue(now);
  const stats = reviewStats(now);
  const all = reviewNoteList(now);
  const first = queue[0] || null;
  const next = first ? null : all.find((x) => !x.info.due);

  const html = `
    <section class="hero memory-hero fade-in">
      <div class="hero-label">今天该回顾</div>
      <div class="hero-value"><b>${queue.length}</b><span>条笔记</span></div>
      <div class="hero-sub">${stats.totalNotes
        ? `共 ${stats.totalNotes} 条带心得的记录 · 已回顾 ${stats.reviewedTotal} 次${stats.reviewedToday ? ` · 今天 ${stats.reviewedToday} 条` : ''}`
        : '还没有带心得的记录，记一笔时写下心得就能开始回顾'}</div>
      <div class="hero-foot">
        <span>${stats.due ? '按间隔重温，记住才算真的学会' : (stats.totalNotes ? '今天的回顾已完成' : '先记一笔学习')}</span>
        <button type="button" data-add-record>+ 记一笔 →</button>
      </div>
    </section>

    ${first ? reviewCard(first, now) : ''}
    ${first && queue.length > 1 ? `<p class="memory-queue-note">还有 ${queue.length - 1} 条排队中，完成这一条后自动出现下一条</p>` : ''}
    ${!first ? `<section class="card memory-empty fade-in">
      <div class="empty" style="padding:30px 18px">
        <span class="em">${stats.totalNotes ? '🎉' : '📝'}</span>
        <p>${stats.totalNotes
          ? `今天的笔记都回顾完了${next ? `<br/>下一次：${dateLabel(next.info.dueAt)}` : ''}`
          : '还没有可回顾的笔记<br/>记录时写一句心得，就会自动进入回顾队列'}</p>
        <button class="btn primary" type="button" data-add-record>${stats.totalNotes ? '再记一笔' : '去记一笔'}</button>
      </div>
    </section>` : ''}

    <section class="card fade-in memory-schedule">
      <div class="card-title"><h3>回顾节奏</h3><span class="more">间隔递增</span></div>
      <p class="memory-hint">每条笔记首次在记录后 1 天出现，之后按 3 → 7 → 15 → 30 → 60 → 120 天依次拉长。每条独立计时，点「想起来了」就顺延到下一次。</p>
    </section>

    <section class="fade-in memory-all">
      <div class="card-title" style="padding:0 6px">
        <h3>全部笔记</h3>
        <span class="more">${all.length} 条</span>
      </div>
      ${all.length ? `<div class="memory-list">
        ${all.map(({ session, info }) => {
          const meta = subjectMeta(session);
          return `<details class="memory-item">
            <summary>
              <span class="memory-dot" style="background:${meta.color}"></span>
              <span class="memory-item-main"><b>${esc(session.title || '学习记录')}</b><small>${meta.name} · ${dateLabel(session.end)}</small></span>
              <span class="memory-status${info.due ? ' is-due' : ''}">${dueLabel(info, now)}</span>
            </summary>
            <div class="memory-item-note">${noteHtml(session.note)}</div>
          </details>`;
        }).join('')}
      </div>` : `<div class="card"><div class="empty" style="padding:22px 18px"><p>还没有写过心得的记录</p></div></div>`}
    </section>
  `;

  function mount(root) {
    root.querySelectorAll('[data-add-record]').forEach((el) => {
      el.addEventListener('click', () => {
        haptic();
        openRecordSheet({ onChange: () => ctx.refresh() });
      });
    });
    root.querySelectorAll('[data-mark]').forEach((el) => {
      el.addEventListener('click', () => {
        haptic();
        const id = el.dataset.mark;
        const nextInfo = markReviewed(id);
        if (nextInfo) {
          toast(nextInfo.count >= 2 ? '已回顾 · 下次间隔又长了一点' : '已回顾 · 3 天后再见');
        }
        ctx.refresh();
      });
    });
  }

  return { title: '笔记回顾', sub: '间隔复习，把学过的记住', html, mount };
}
