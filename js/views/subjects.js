/* 科目视图：按科目看「学了什么」 */
import {
  getState, addSubject, updateSubject, removeSubject, archiveSubject,
  COLORS, EMOJIS, lastNDays, activeSubjects, archivedSubjects,
} from '../store.js';
import {
  esc, fmtMin, fmtMinShort, dateKey, openSheet, closeSheet, toast, haptic, confirmSheet,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';
import { recordItem } from './log.js';

function weekStats(subjectId) {
  const keys = new Set(lastNDays(7).map((d) => d.key));
  const list = getState().sessions.filter(
    (s) => s.subjectId === subjectId && keys.has(dateKey(new Date(s.end))),
  );
  return { min: list.reduce((sum, s) => sum + s.minutes, 0), count: list.length };
}

function sessionsOf(subjectId) {
  return getState().sessions
    .filter((s) => s.subjectId === subjectId)
    .sort((a, b) => b.end - a.end);
}

function subjectRow(r, archived) {
  const goal = r.goalMinWeek || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((r.week / goal) * 100)) : 0;
  return `
    <button class="row" type="button" data-subject="${r.id}">
      <div class="row-ic" style="background:${r.color}18;color:${r.color}">${r.emoji}</div>
      <div class="row-main">
        <div class="row-title">${esc(r.name)}${archived ? ' <span class="hint" style="font-weight:400">已归档</span>' : ''}</div>
        <div class="row-sub">${goal > 0
          ? `本周 ${fmtMinShort(r.week)} / 目标 ${fmtMinShort(goal)} · ${pct}%`
          : (r.last ? `最近：${esc(r.last.title || '未填写学习内容')}` : '还没有记录')}</div>
        <div class="bar-track" style="margin-top:7px;height:5px">
          <div class="bar-fill" style="width:${goal > 0 ? Math.max(2, pct) : Math.max(2, Math.round((r.week / r.maxWeek) * 100))}%;background:${goal > 0 && pct >= 100 ? 'var(--success, #12b76a)' : r.color}"></div>
        </div>
      </div>
      <div class="row-val">${r.count ? `${r.count} 条` : '—'}</div>
    </button>`;
}

export function renderSubjects(ctx) {
  const state = getState();
  const build = (s) => {
    const all = sessionsOf(s.id);
    const week = weekStats(s.id);
    return {
      ...s,
      week: week.min,
      weekCount: week.count,
      total: all.reduce((sum, x) => sum + x.minutes, 0),
      count: all.length,
      last: all[0] || null,
    };
  };
  const allRows = state.subjects.map(build);
  const rows = allRows.filter((r) => !r.archived);
  const archived = allRows.filter((r) => r.archived);
  const maxWeek = Math.max(60, ...rows.map((r) => r.week));
  rows.forEach((r) => { r.maxWeek = maxWeek; });
  archived.forEach((r) => { r.maxWeek = maxWeek; });
  const weekTotal = rows.reduce((sum, r) => sum + r.week, 0);
  const goalRows = rows.filter((r) => (r.goalMinWeek || 0) > 0);
  const goalDone = goalRows.filter((r) => r.week >= r.goalMinWeek).length;

  const html = `
    <section class="card fade-in">
      <div class="card-title">
        <h3>我的科目</h3>
        <button class="more" type="button" data-act="add">+ 新建</button>
      </div>
      <div class="list">
        ${rows.length ? rows.map((r) => subjectRow(r, false)).join('') : `
          <div class="empty"><span class="em">📚</span><p>还没有科目<br/>先创建一个想学的科目</p></div>`}
      </div>
      ${rows.length ? `<p class="hint mt16">近 7 天共 ${fmtMinShort(weekTotal)}${goalRows.length ? ` · ${goalDone}/${goalRows.length} 个科目达成周目标` : ''} · 点击科目看学了什么</p>` : ''}
    </section>

    ${archived.length ? `
      <section class="card flat fade-in">
        <div class="card-title"><h3>已归档 ${archived.length}</h3><span class="more">记录与统计仍保留</span></div>
        <div class="list">
          ${archived.map((r) => subjectRow(r, true)).join('')}
        </div>
      </section>` : ''}

    <button class="btn primary block fade-in" type="button" data-act="add">+ 新建科目</button>
  `;

  function openEditor(subject) {
    const isNew = !subject;
    const data = subject || { name: '', emoji: EMOJIS[0], color: COLORS[0], goalMinWeek: 0, archived: false };
    const body = `
      <h2 class="sheet-title">${isNew ? '新建科目' : '编辑科目'}</h2>
      <p class="sheet-desc">科目用来给学习记录分类，统计时会按科目汇总。</p>
      <div class="field">
        <label>名称</label>
        <input class="input" id="sub-name" maxlength="16" placeholder="例如：高等数学" value="${esc(data.name)}" />
      </div>
      <div class="field">
        <label>每周目标（小时，0 表示不设目标）</label>
        <input class="input" id="sub-goal" type="number" min="0" max="80" step="0.5"
          value="${((data.goalMinWeek || 0) / 60).toFixed((data.goalMinWeek || 0) % 60 === 0 ? 0 : 1)}"
          placeholder="例如：5" />
        <p class="hint mt8">设置后，统计页与科目页会显示本周达成进度。</p>
      </div>
      <div class="field">
        <label>图标</label>
        <div class="emoji-grid" id="sub-emoji">
          ${EMOJIS.map((e) => `<button class="emoji-opt${e === data.emoji ? ' on' : ''}" type="button" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>颜色</label>
        <div class="swatches" id="sub-color">
          ${COLORS.map((c) => `<button class="swatch${c === data.color ? ' on' : ''}" type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="sheet-actions">
        ${isNew ? '' : `<button class="btn" type="button" data-act="archive">${data.archived ? '恢复使用' : '归档'}</button>`}
        ${isNew ? '' : '<button class="btn danger" type="button" data-act="delete">删除</button>'}
        <button class="btn primary" type="button" data-act="save">保存</button>
      </div>
    `;

    openSheet(body, (sheet) => {
      let emoji = data.emoji;
      let color = data.color;
      sheet.querySelectorAll('[data-emoji]').forEach((b) => {
        b.addEventListener('click', () => {
          emoji = b.dataset.emoji;
          sheet.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      sheet.querySelectorAll('[data-color]').forEach((b) => {
        b.addEventListener('click', () => {
          color = b.dataset.color;
          sheet.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
        const name = sheet.querySelector('#sub-name').value.trim();
        if (!name) { toast('请输入科目名称'); return; }
        const goalHours = Number(sheet.querySelector('#sub-goal').value) || 0;
        const goalMinWeek = Math.max(0, Math.round(goalHours * 60));
        if (isNew) addSubject({ name, emoji, color, goalMinWeek });
        else updateSubject(subject.id, { name, emoji, color, goalMinWeek });
        closeSheet();
        toast(isNew ? '科目已创建' : '已保存');
        ctx.refresh();
      });
      const arch = sheet.querySelector('[data-act="archive"]');
      if (arch) {
        arch.addEventListener('click', async () => {
          const nextArchived = !data.archived;
          const ok = await confirmSheet({
            title: nextArchived ? '归档这个科目？' : '恢复这个科目？',
            desc: nextArchived
              ? '归档后它不会出现在「记一笔」和科目列表主区，但历史记录与统计全部保留，随时可以恢复。'
              : '恢复后会重新出现在「记一笔」的科目选择里。',
            okText: nextArchived ? '归档' : '恢复',
            danger: nextArchived,
          });
          if (!ok) return;
          archiveSubject(subject.id, nextArchived);
          closeSheet();
          toast(nextArchived ? '已归档，历史记录保留' : '已恢复');
          ctx.refresh();
        });
      }
      const del = sheet.querySelector('[data-act="delete"]');
      if (del) {
        del.addEventListener('click', () => {
          const actions = sheet.querySelector('.sheet-actions');
          actions.innerHTML = `
            <button class="btn" type="button" data-act="cancel-del">再想想</button>
            <button class="btn danger-solid" type="button" data-act="do-del">确认删除</button>
          `;
          const tip = document.createElement('p');
          tip.className = 'hint';
          tip.style.margin = '0 0 12px';
          tip.textContent = '该科目下的所有学习记录会一起删除，不可恢复。';
          actions.parentNode.insertBefore(tip, actions);
          actions.querySelector('[data-act="cancel-del"]').addEventListener('click', () => openEditor(subject));
          actions.querySelector('[data-act="do-del"]').addEventListener('click', () => {
            removeSubject(subject.id);
            closeSheet();
            toast('已删除');
            ctx.refresh();
          });
        });
      }
      setTimeout(() => sheet.querySelector('#sub-name')?.focus(), 120);
    });
  }

  /* 科目详情：这个科目学过什么、学了多久 */
  function openDetail(subject) {
    const all = sessionsOf(subject.id);
    const totalMin = all.reduce((sum, s) => sum + s.minutes, 0);
    const weekMin = weekStats(subject.id).min;
    const days = new Set(all.map((s) => dateKey(new Date(s.end)))).size;
    const recent = all.slice(0, 10);
    const total = fmtMin(totalMin);
    const goal = subject.goalMinWeek || 0;
    const pct = goal > 0 ? Math.min(100, Math.round((weekMin / goal) * 100)) : 0;

    openSheet(`
      <h2 class="sheet-title">${subject.emoji} ${esc(subject.name)}</h2>
      <p class="sheet-desc">累计 ${total.text} · ${all.length} 条记录 · ${days} 天 · 本周 ${fmtMinShort(weekMin)}</p>
      ${goal > 0 ? `
        <div style="margin:2px 0 14px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-3);margin-bottom:6px">
            <span>本周目标 ${fmtMinShort(goal)}</span>
            <span style="color:${pct >= 100 ? 'var(--success, #12b76a)' : 'var(--primary)'};font-weight:600">${pct}%${pct >= 100 ? ' 已达成 🎉' : ''}</span>
          </div>
          <div class="bar-track" style="height:7px"><div class="bar-fill" style="width:${Math.max(2, pct)}%;background:${pct >= 100 ? 'var(--success, #12b76a)' : subject.color}"></div></div>
        </div>` : ''}
      <div class="stat-grid" style="margin-bottom:4px">
        <div class="stat"><b>${fmtMinShort(totalMin)}</b><span>累计时长</span></div>
        <div class="stat"><b>${all.length}<small>条</small></b><span>学习记录</span></div>
        <div class="stat"><b>${days}<small>天</small></b><span>学习天数</span></div>
      </div>
      <div class="section-label" style="margin-top:18px">学过什么</div>
      ${recent.length ? recent.map((s) => recordItem(s, { showDate: true, hideSubject: true })).join('')
        : '<div class="empty" style="padding:16px 0"><p>这个科目还没有学习记录</p></div>'}
      ${all.length > recent.length ? `<p class="hint" style="text-align:center;margin:10px 0 0">还有 ${all.length - recent.length} 条更早的记录</p>` : ''}
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="close">关闭</button>
        <button class="btn primary" type="button" data-act="edit">编辑科目</button>
      </div>
    `, (sheet) => {
      sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(subject));
      sheet.querySelectorAll('[data-session]').forEach((row) => {
        row.addEventListener('click', () => openRecordSheet({
          id: row.dataset.session,
          onChange: () => ctx.refresh(),
          back: () => openDetail(subject),
        }));
      });
    });
  }

  function mount(root) {
    root.querySelectorAll('[data-act="add"]').forEach((el) => {
      el.addEventListener('click', () => { haptic(); openEditor(null); });
    });
    root.querySelectorAll('[data-subject]').forEach((row) => {
      row.addEventListener('click', () => {
        const subject = getState().subjects.find((s) => s.id === row.dataset.subject);
        if (subject) openDetail(subject);
      });
    });
  }

  return { title: '科目', sub: `${state.subjects.length} 个科目`, html, mount };
}
