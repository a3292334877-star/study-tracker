/* 记录弹层：记一笔 / 编辑一条 / 按天查看
   产品核心是「记录学习内容」：科目 + 学了什么 + 时长（可选）+ 心得
   v1.4：标签输入、常用模板一键记、删除后可撤销 */
import {
  getState, getSubject, getSession, updateSession, removeSession, restoreSession,
  addSession, activeSubjects, getTemplates, addTemplate, touchTemplate, normTags,
} from './store.js';
import {
  esc, fmtMinShort, hhmm, dateKey, relativeDay, parseKey,
  openSheet, closeSheet, toast, confirmSheet, haptic, isSheetOpen,
} from './util.js';

const QUICK_MIN = [15, 30, 45, 60, 90];
const TPL_LIMIT = 6;   // 表单里最多显示几个模板
const UNDO_MS = 8000;  // 撤销条停留时间

/* ---------- 删除撤销条 ----------
   toast 只能显示文字，撤销需要一个能点的按钮，所以这里单独实现一条 */
let undoEl = null;
let undoTimer = 0;

function onUndoKeydown(e) {
  if (e.key === 'Escape') clearUndoBar();
}

function clearUndoBar() {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = 0; }
  document.removeEventListener('keydown', onUndoKeydown);
  if (undoEl) { undoEl.remove(); undoEl = null; }
  document.body.classList.remove('sheetx-undo-open', 'sheetx-undo-sheet');
}

/* 底部撤销条：role=status / aria-live=polite，8 秒后自动消失，Esc 也能关 */
function showUndoBar({ text, onUndo }) {
  clearUndoBar();
  const el = document.createElement('div');
  el.className = 'sheetx-undo';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = '<span class="sheetx-undo-text">' + esc(text) + '</span>'
    + '<button class="sheetx-undo-btn" type="button" aria-label="撤销删除">撤销</button>';
  document.body.appendChild(el);
  undoEl = el;
  document.body.classList.add('sheetx-undo-open');
  // 弹层还开着时（按天列表），撤销条贴底，弹层自己让出底部空间
  if (isSheetOpen()) document.body.classList.add('sheetx-undo-sheet');
  requestAnimationFrame(() => el.classList.add('on'));
  document.addEventListener('keydown', onUndoKeydown);
  el.querySelector('.sheetx-undo-btn').addEventListener('click', () => {
    clearUndoBar();
    onUndo();
  });
  undoTimer = setTimeout(clearUndoBar, UNDO_MS);
}

/* ---------- 模板 chips ---------- */
function tplParts(t) {
  const sub = getSubject(t.subjectId);
  const name = sub ? (sub.emoji || '📘') + ' ' + sub.name : '📘';
  const mins = t.minutes > 0 ? ' · ' + t.minutes + '分' : '';
  return {
    text: name + ' · ' + (t.title || '无标题') + mins,
    aria: '用模板：' + (sub ? sub.name + ' ' : '') + (t.title || '无标题')
      + (t.minutes > 0 ? ' ' + t.minutes + '分' : ''),
  };
}

function tplHTML() {
  const list = getTemplates().slice(0, TPL_LIMIT);
  if (!list.length) return '<p class="hint sheetx-tpls-empty">还没有模板 · 记完点「存为模板」，下次一键填</p>';
  return list.map((t) => {
    const p = tplParts(t);
    return '<button class="chip chip-sm sheetx-tpl" type="button" data-tpl="' + esc(t.id) + '"'
      + ' aria-label="' + esc(p.aria) + '">' + esc(p.text) + '</button>';
  }).join('');
}

/* ---------- 核心表单：记一笔 / 编辑 ----------
   id     传入则为编辑模式
   endTs  记录的结束时间（决定日期），默认此刻
   initial 预填 { title, subjectId, dateKey, minutes, tags, note }（v1.19：任务一键记一笔）
   onChange 数据变更回调
   onSaved  新建成功后的回调，参数为新建的记录
   back   关闭/保存后回到哪个弹层 */
export function openRecordSheet({ id = null, endTs, onChange, onSaved, initial, back, heading, desc } = {}) {
  const editing = Boolean(id);
  const session = editing ? getSession(id) : null;
  if (editing && !session) return;

  const allSessions = getState().sessions;
  const lastSession = (!editing && allSessions.length)
    ? [...allSessions].sort((a, b) => b.end - a.end)[0]
    : null;
  const lastSub = lastSession ? getSubject(lastSession.subjectId) : null;

  const allSubs = getState().subjects;
  const wantedSid = editing ? session.subjectId : (initial && initial.subjectId ? String(initial.subjectId) : null);
  const subjects = allSubs.filter((s) => !s.archived || s.id === wantedSid);
  const base = editing ? session : null;
  const initialKey = (!base && initial && /^\d{4}-\d{2}-\d{2}$/.test(String(initial.dateKey || '')))
    ? String(initial.dateKey)
    : null;
  let end = base ? base.end : (endTs || Date.now());
  if (initialKey) {
    if (initialKey === dateKey(new Date())) {
      end = Date.now();
    } else {
      const d0 = parseKey(initialKey);
      d0.setHours(20, 0, 0, 0);
      end = d0.getTime();
    }
  }
  const initKey = dateKey(new Date(end));
  const initTitle = base ? (base.title || '') : (initial && initial.title ? String(initial.title).slice(0, 40) : '');
  const initNote = base ? (base.note || '') : (initial && initial.note ? String(initial.note) : '');
  const initMin = base ? base.minutes
    : (initial && initial.minutes !== undefined && Number.isFinite(Number(initial.minutes))
      ? Math.max(0, Math.round(Number(initial.minutes))) : 30);
  const initTags = base ? (base.tags || []).join(' ')
    : (initial && Array.isArray(initial.tags) ? initial.tags.join(' ') : '');
  const initSid = base ? base.subjectId
    : (wantedSid || (subjects[0] ? subjects[0].id : (allSubs[0] ? allSubs[0].id : null)));

  openSheet(`
    <h2 class="sheet-title">${heading || (editing ? '编辑记录' : '记一笔学习')}</h2>
    <p class="sheet-desc">${desc || (editing
      ? `${relativeDay(new Date(end))} ${hhmm(end)} · 改完记得保存`
      : '写下这次学了什么，时长不填也能记。')}</p>

    ${!editing && lastSession ? `
      <div class="sheetx-last" id="r-last-box">
        <span class="sheetx-last-text">上一条：${lastSub ? (lastSub.emoji || '📘') : '📘'} ${esc(lastSession.title || '无标题')}${lastSession.minutes ? ' (' + lastSession.minutes + '分)' : ''}</span>
        <button class="btn sheetx-last-btn" type="button" id="r-copy-last">⚡ 复制上一条</button>
      </div>` : ''}

    <div class="field">
      <label>科目</label>
      <div class="chips" id="r-subjects">
        ${subjects.length
          ? subjects.map((s) => `<button class="chip${s.id === initSid ? ' on' : ''}" type="button" data-sid="${s.id}">${s.emoji} ${esc(s.name)}${s.archived ? ' (已归档)' : ''}</button>`).join('')
          : '<span class="hint">还没有科目，先去「我的 → 工具 → 科目管理」创建一个</span>'}
      </div>
    </div>

    <div class="field">
      <label for="r-title">学了什么</label>
      <input class="input" id="r-title" maxlength="40" placeholder="例如：第三章 导数计算"
        value="${esc(initTitle)}" />
    </div>

    <div class="field">
      <label for="r-tags">标签（可选）</label>
      <input class="input sheetx-tags-input" id="r-tags" maxlength="40"
        placeholder="如：错题、复述、真题" aria-label="标签，多个用逗号或空格分隔"
        value="${esc(initTags)}" />
      <div class="sheetx-tag-chips" id="r-tag-chips"></div>
    </div>

    <div class="field">
      <label for="r-minutes">时长（分钟，可不填）</label>
      <input class="input" id="r-minutes" type="number" min="0" max="720"
        value="${initMin > 0 ? initMin : ''}" placeholder="留空表示只记内容" />
      <div class="chips mt8" id="r-quick">
        ${QUICK_MIN.map((m) => `<button class="chip chip-sm" type="button" data-min="${m}">${m} 分</button>`).join('')}
      </div>
    </div>

    <div class="field">
      <label for="r-date">日期</label>
      <input class="input" id="r-date" type="date" value="${initKey}" max="${dateKey(new Date())}" />
    </div>

    <div class="field">
      <label for="r-note">心得 / 笔记（可选）</label>
      <textarea class="input textarea" id="r-note" maxlength="500" rows="3"
        placeholder="记下重点、没搞懂的疑问、错在哪…">${esc(initNote)}</textarea>
    </div>

    <div class="field">
      <label>常用模板</label>
      <div class="chips sheetx-tpls" id="r-tpls">${tplHTML()}</div>
      <button class="btn sheetx-save-tpl" type="button" data-act="tpl-save">＋ 存为模板</button>
    </div>

    <div class="sheet-actions">
      ${editing ? '<button class="btn danger" type="button" data-act="delete">删除</button>' : '<button class="btn" type="button" data-act="cancel">取消</button>'}
      <button class="btn primary" type="button" data-act="save">${editing ? '保存' : '记下来'}</button>
    </div>
  `, (sheet) => {
    let sid = initSid;

    const titleInput = sheet.querySelector('#r-title');
    const minInput = sheet.querySelector('#r-minutes');
    const tagsInput = sheet.querySelector('#r-tags');
    const tagBox = sheet.querySelector('#r-tag-chips');
    const tplBox = sheet.querySelector('#r-tpls');

    const setSid = (v) => {
      sid = v;
      sheet.querySelectorAll('[data-sid]').forEach((x) => x.classList.toggle('on', x.dataset.sid === v));
    };
    sheet.querySelectorAll('[data-sid]').forEach((b) => {
      b.addEventListener('click', () => setSid(b.dataset.sid));
    });

    // 时长快捷 chips
    const syncQuick = (m) => sheet.querySelectorAll('[data-min]')
      .forEach((x) => x.classList.toggle('on', Number(x.dataset.min) === m));
    sheet.querySelectorAll('[data-min]').forEach((b) => {
      b.addEventListener('click', () => {
        const v = Number(b.dataset.min);
        minInput.value = String(v);
        syncQuick(v);
      });
    });

    /* 标签：输入时实时渲染成可点 × 的小 chip */
    const renderTagChips = () => {
      const list = normTags(tagsInput.value);
      tagBox.innerHTML = list.map((t) => '<span class="sheetx-tag-chip">'
        + '<span class="sheetx-tag-name">' + esc(t) + '</span>'
        + '<button class="sheetx-tag-x" type="button" data-tag="' + esc(t) + '"'
        + ' aria-label="删除标签 ' + esc(t) + '">×</button>'
        + '</span>').join('');
      tagBox.hidden = list.length === 0;
    };
    const setTags = (v) => {
      tagsInput.value = v;
      renderTagChips();
    };
    tagsInput.addEventListener('input', renderTagChips);
    tagBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      const rest = normTags(tagsInput.value).filter((t) => t !== b.dataset.tag);
      setTags(rest.join(' '));
      tagsInput.focus();
    });
    renderTagChips();

    /* ⚡ 复制上一条：把上一条的科目 / 内容 / 时长 / 标签 / 心得带进来 */
    const copyBtn = sheet.querySelector('#r-copy-last');
    if (copyBtn && lastSession) {
      copyBtn.addEventListener('click', () => {
        titleInput.value = lastSession.title || '';
        sheet.querySelector('#r-note').value = lastSession.note || '';
        if (lastSession.minutes > 0) minInput.value = String(lastSession.minutes);
        syncQuick(lastSession.minutes);
        if (lastSession.subjectId) setSid(lastSession.subjectId);
        setTags((lastSession.tags || []).join(' '));
        const box = sheet.querySelector('#r-last-box');
        if (box) {
          const tip = document.createElement('span');
          tip.className = 'hint sheetx-last-tip';
          tip.textContent = '已填充 ✓';
          copyBtn.replaceWith(tip);
        }
        haptic();
        toast('已复制上一条，可直接改');
      });
    }

    const closeOrBack = () => {
      if (typeof back === 'function') back();
      else closeSheet();
    };

    const cancel = sheet.querySelector('[data-act="cancel"]');
    if (cancel) cancel.addEventListener('click', closeSheet);

    sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
      const title = titleInput.value.trim();
      const note = sheet.querySelector('#r-note').value.trim();
      const tags = normTags(tagsInput.value);
      const raw = minInput.value.trim();
      const minutes = raw === '' ? 0 : Math.max(0, Math.round(Number(raw) || 0));
      const dayKey = sheet.querySelector('#r-date').value || dateKey(new Date());
      if (!title) { toast('写一句「学了什么」吧'); titleInput.focus(); return; }
      if (!sid) { toast('请先创建科目'); return; }

      // 日期换了就重算起止时间
      let endTs = end;
      if (dayKey !== initKey) {
        const d = parseKey(dayKey);
        if (dayKey === dateKey(new Date())) {
          endTs = Date.now();
        } else {
          d.setHours(20, 0, 0, 0);
          endTs = d.getTime();
        }
      }

      if (editing) {
        updateSession(id, { subjectId: sid, title, note, minutes, tags, end: endTs });
        toast('已保存');
      } else {
        const created = addSession({
          subjectId: sid, title, note, minutes, tags, end: endTs,
          start: endTs - minutes * 60000,
        });
        toast(minutes > 0 ? `已记下 · ${fmtMinShort(minutes)}` : '已记下');
        if (onSaved) onSaved(created);
      }
      closeOrBack();
      if (onChange) onChange();
    });

    /* 存为模板 */
    sheet.querySelector('[data-act="tpl-save"]').addEventListener('click', () => {
      const title = titleInput.value.trim();
      if (!title) { toast('先写一句「学了什么」'); titleInput.focus(); return; }
      if (getTemplates().some((t) => (t.title || '').trim() === title)) {
        toast('这条模板已存在');
        return;
      }
      const raw = minInput.value.trim();
      const minutes = raw === '' ? 0 : Math.max(0, Math.round(Number(raw) || 0));
      const saved = addTemplate({ subjectId: sid, title, minutes, tags: normTags(tagsInput.value) });
      if (!saved) { toast('这条模板已存在'); return; }
      tplBox.innerHTML = tplHTML();
      haptic();
      toast('已存为模板');
    });

    /* 模板 chips：一键填入科目 / 内容 / 时长 / 标签 */
    tplBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tpl]');
      if (!btn) return;
      const tpl = getTemplates().find((t) => t.id === btn.dataset.tpl);
      if (!tpl) return;
      titleInput.value = tpl.title || '';
      minInput.value = tpl.minutes > 0 ? String(tpl.minutes) : '';
      syncQuick(tpl.minutes);
      if (tpl.subjectId && sheet.querySelector('[data-sid="' + tpl.subjectId + '"]')) setSid(tpl.subjectId);
      setTags((tpl.tags || []).join(' '));
      touchTemplate(tpl.id);
      haptic();
      toast('已填入模板');
      titleInput.focus();
    });

    /* 删除：删掉后给一条 8 秒的撤销机会 */
    const del = sheet.querySelector('[data-act="delete"]');
    if (del) {
      del.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: '删除这条记录？',
          desc: '删掉后 8 秒内还能在底部撤销；超过 8 秒也能在「我的 · 记录回收站」找回。',
          okText: '删除', danger: true,
        });
        if (!ok) { openRecordSheet({ id, onChange, back }); return; }
        const removed = removeSession(id);
        const name = (session && session.title ? session.title : (getSubject(session && session.subjectId)?.name || '这条记录'));
        closeOrBack();
        if (onChange) onChange();
        if (!removed) { toast('已删除'); return; }
        showUndoBar({
          text: '已删除「' + name + '」',
          onUndo: () => {
            restoreSession(removed);
            toast('已撤销');
            if (onChange) onChange();
          },
        });
      });
    }

    if (!editing) setTimeout(() => titleInput?.focus(), 160);
  });
}

/* 兼容旧调用：编辑单条 */
export function openSessionEditor(id, { onChange, back } = {}) {
  return openRecordSheet({ id, onChange, back });
}

/* 兼容旧调用：补记一条 */
export function openManualSheet({ onChange, endTs } = {}) {
  return openRecordSheet({ endTs, onChange });
}

/* ---------- 按天查看当天的全部记录 ---------- */
export function openDaySheet(key, onChange) {
  const all = getState().sessions
    .filter((s) => dateKey(new Date(s.end)) === key)
    .sort((a, b) => b.end - a.end);
  const total = all.reduce((sum, s) => sum + s.minutes, 0);
  const isToday = key === dateKey(new Date());

  openSheet(`
    <h2 class="sheet-title">${relativeDay(parseKey(key))}</h2>
    <p class="sheet-desc">${key} · ${all.length ? `${all.length} 条记录${total ? ` · 共 ${fmtMinShort(total)}` : ''}` : '这天没有记录'}</p>
    <div class="list" id="day-list">
      ${all.length ? all.map((s) => {
        const subject = getSubject(s.subjectId);
        const color = subject?.color || '#4f6df5';
        return `<button class="row" type="button" data-session="${s.id}">
          <div class="row-ic" style="background:${color}18;color:${color}">${subject?.emoji || '📘'}</div>
          <div class="row-main">
            <div class="row-title">${esc(s.title || subject?.name || '未命名')}</div>
            <div class="row-sub">${hhmm(s.start)} – ${hhmm(s.end)}${s.minutes ? ` · ${fmtMinShort(s.minutes)}` : ' · 未计时'}</div>
          </div>
          <div class="row-chev">›</div>
        </button>`;
      }).join('') : `<div class="empty" style="padding:16px 0"><p>${isToday ? '今天还没有学习记录' : '这天没有学习记录'}</p></div>`}
    </div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="close">关闭</button>
      <button class="btn primary" type="button" data-act="add">补记一条</button>
    </div>
  `, (sheet) => {
    sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="add"]').addEventListener('click', () => {
      openRecordSheet({ endTs: defaultEndForDay(key), onChange });
    });
    sheet.querySelectorAll('[data-session]').forEach((row) => {
      row.addEventListener('click', () => openRecordSheet({
        id: row.dataset.session,
        onChange,
        back: () => openDaySheet(key, onChange),
      }));
    });
  });
}

/* 当天默认的记录结束时间：今天用此刻，历史日期用 20:00 */
function defaultEndForDay(key) {
  if (key === dateKey(new Date())) return Date.now();
  const d = parseKey(key);
  d.setHours(20, 0, 0, 0);
  return d.getTime();
}
