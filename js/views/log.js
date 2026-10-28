/* 记录视图：全部学习记录的时间线 + 搜索 / 科目 / 标签筛选
   这是 App 的核心页面 —— 回看「我学过什么」
   v1.4：分页加载（每页 50 条）、科目与标签筛选、关键词高亮 */
import { querySessions, allTags, groupByDay, getState, getSubject } from '../store.js';
import {
  esc, highlight, fmtMinShort, hhmm, relativeDay, weekdayCN, dateKey, addDays, haptic,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';

const PAGE = 50;        // 每页条数
const TAG_CHIPS = 10;   // 标签筛选最多展示的个数

/* 一条记录卡（首页 / 记录页 / 科目详情共用）
   opts.showDate   显示日期小标签
   opts.hideSubject 不显示科目标签（科目详情里用）
   opts.showTags   显示标签小 chip（记录页用）
   opts.q          搜索关键词，标题 / 笔记 / 标签命中处高亮 */
export function recordItem(s, opts = {}) {
  const subject = getSubject(s.subjectId);
  const color = subject?.color || '#4f6df5';
  const q = opts.q || '';
  const untitled = !s.title;
  const meta = [];
  if (opts.showDate) meta.push(`<span class="rec-tag">${relativeDay(new Date(s.end))}</span>`);
  if (!opts.hideSubject && subject) meta.push(`<span class="rec-tag">${subject.emoji} ${esc(subject.name)}</span>`);
  // 标签小 chip：跟在科目标签后面（记录页才显示，首页 / 统计页保持原样）
  if (opts.showTags && Array.isArray(s.tags)) {
    s.tags.forEach((t) => meta.push(`<span class="log-tag">#${highlight(t, q)}</span>`));
  }
  meta.push(`<span class="rec-dur">${s.minutes ? fmtMinShort(s.minutes) : '未计时'}</span>`);
  meta.push(`<span>${hhmm(s.start)}</span>`);

  return `<button class="rec" type="button" data-session="${s.id}">
    <div class="rec-ic" style="background:${color}18;color:${color}">${subject?.emoji || '📘'}</div>
    <div class="rec-main">
      <div class="rec-title"${untitled ? ' style="color:var(--text-3)"' : ''}>${highlight(s.title || '未填写学习内容', q)}</div>
      <div class="rec-meta">${meta.join('')}</div>
      ${s.note ? `<div class="rec-note">${highlight(s.note, q)}</div>` : ''}
    </div>
  </button>`;
}

/* 按天分组的时间线（v1.4：支持高亮与标签 chip；分组节点带 data-day / data-count 便于追加） */
export function recordTimeline(groups, { showDate = false, showTags = false, q = '' } = {}) {
  return groups.map((g) => `<section class="tl-day" data-day="${g.key}" data-count="${g.sessions.length}">
    <div class="tl-head">
      <div class="tl-date">${relativeDay(g.date)}<small>${weekdayCN(g.date)} · ${g.sessions.length} 条</small></div>
      <div class="tl-sum">${g.minutes ? fmtMinShort(g.minutes) : ''}</div>
    </div>
    <div class="tl-card">
      ${g.sessions.map((s) => recordItem(s, { showDate, showTags, q })).join('')}
    </div>
  </section>`).join('');
}

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '本月' },
];

export function renderLog(ctx) {
  let softRefresh = null;   // mount 里注册的局部刷新入口（供 app 在数据变化时调用）
  const state = getState();
  const initial = querySessions({});
  const totalAll = state.sessions.length;

  /* 筛选 chips 用函数生成：局部刷新时可以按最新数据重建（科目、标签增删后菜谱要跟着变） */
  function subjectRail() {
    const list = getState().subjects || [];
    if (!list.length) return '';
    const chips = list.map((s) => `<button class="chip log-chip" type="button" data-act="subject" data-sid="${esc(s.id)}" aria-pressed="false">${s.emoji ? `${s.emoji} ` : ''}${esc(s.name)}${s.archived ? '<span class="log-arch">已归档</span>' : ''}</button>`).join('');
    return `<div class="log-rail" role="group" aria-label="按科目筛选">
        <button class="chip log-chip on" type="button" data-act="subject" data-sid="" aria-pressed="true">全部科目</button>
        ${chips}
      </div>`;
  }

  function tagRail() {
    const tags = allTags().slice(0, TAG_CHIPS);
    if (!tags.length) return '';
    const chips = tags.map((t) => `<button class="chip log-chip" type="button" data-act="tag" data-tag="${esc(t.tag)}" aria-pressed="false">#${esc(t.tag)}<span class="log-num">${t.count}</span></button>`).join('');
    return `<div class="log-rail" role="group" aria-label="按标签筛选">
        <button class="chip log-chip on" type="button" data-act="tag" data-tag="" aria-pressed="true">全部标签</button>
        ${chips}
      </div>`;
  }

  const html = `
    <div class="search fade-in">
      <svg class="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="log-q" type="search" placeholder="搜学习内容、笔记、科目…" autocomplete="off" aria-label="搜索学习记录" />
      <button class="clr" type="button" id="log-clr" aria-label="清除搜索词" hidden>✕</button>
    </div>

    <div class="log-filters fade-in">
      <div class="seg" id="log-seg" role="group" aria-label="时间范围">
        ${FILTERS.map((f) => `<button type="button" data-filter="${f.key}" class="${f.key === 'all' ? 'on' : ''}" aria-pressed="${f.key === 'all' ? 'true' : 'false'}">${f.label}</button>`).join('')}
      </div>

      ${subjectRail()}

      ${tagRail()}
    </div>

    <p class="hint log-count" id="log-count" aria-live="polite">
      ${totalAll ? `共 ${initial.total} 条 · 合计 ${fmtMinShort(initial.totalMin)}` : '还没有记录'}
    </p>

    <div id="log-body"></div>

    <div class="log-more" id="log-more" aria-live="polite"></div>

    <button class="btn primary block fade-in" type="button" id="log-add" style="margin-top:20px" aria-label="新增一条学习记录">+ 记一笔学习</button>
  `;

  function mount(root) {
    const body = root.querySelector('#log-body');
    const more = root.querySelector('#log-more');
    const countEl = root.querySelector('#log-count');
    const input = root.querySelector('#log-q');
    const clr = root.querySelector('#log-clr');

    let range = 'all';      // 时间范围：all / week / month
    let query = '';         // 搜索词
    let subjectId = null;   // 科目筛选
    let tag = null;         // 标签筛选
    let items = [];         // 已加载的记录（按页追加）
    let total = 0;          // 当前筛选下的总条数（全量口径）
    let totalMin = 0;
    let hasMore = false;
    let timer = 0;

    /* 时间范围 → 日期键 */
    function rangeKeys() {
      const now = new Date();
      if (range === 'week') return { fromKey: dateKey(addDays(now, -6)), toKey: dateKey(now) };
      if (range === 'month') {
        return { fromKey: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), toKey: dateKey(now) };
      }
      return {};
    }

    function params(offset, limit = PAGE) {
      const { fromKey = null, toKey = null } = rangeKeys();
      return { q: query, subjectId, tag, fromKey, toKey, offset, limit };
    }

    function isFiltered() {
      return Boolean(query || subjectId || tag) || range !== 'all';
    }

    /* ---------- 统计行 ---------- */
    function paintCount() {
      // 只要有搜索或筛选（科目 / 标签 / 时间范围）就报「找到 N 条」，否则报「共 N 条」
      if (!total) { countEl.textContent = isFiltered() ? '找到 0 条' : '还没有记录'; return; }
      const min = fmtMinShort(totalMin);
      countEl.textContent = isFiltered()
        ? `找到 ${total} 条 · 合计 ${min}`
        : `共 ${total} 条 · 合计 ${min}`;
    }

    /* ---------- 按天分组渲染（追加时只补新分组 / 补变化的末组） ---------- */
    function buildSection(g) {
      const tpl = document.createElement('template');
      tpl.innerHTML = recordTimeline([g], { q: query, showTags: true }).trim();
      return tpl.content.firstElementChild;
    }

    function renderGroups() {
      const groups = groupByDay(items);
      const existing = new Map();
      body.querySelectorAll('.tl-day').forEach((el) => existing.set(el.dataset.day, el));
      groups.forEach((g) => {
        const old = existing.get(g.key);
        existing.delete(g.key);
        if (old && old.dataset.count === String(g.sessions.length)) return;
        const fresh = buildSection(g);
        if (old) old.replaceWith(fresh);
        else body.appendChild(fresh);
      });
      existing.forEach((el) => el.remove());
    }

    function renderEmpty() {
      body.innerHTML = isFiltered()
        ? `<div class="empty">
            <span class="em">🔍</span>
            <p>没有符合条件的记录<br/>换个关键词，或清除筛选试试</p>
            <button class="btn log-clear" type="button" data-act="log-clear" aria-label="清除全部筛选条件">清除筛选</button>
          </div>`
        : `<div class="empty"><span class="em">📖</span><p>还没有学习记录<br/>记下今天学了什么吧</p></div>`;
    }

    /* ---------- 加载更多 / 已显示全部 ---------- */
    function renderMore() {
      more.innerHTML = '';
      if (!total) return;
      if (hasMore) {
        const left = Math.max(0, total - items.length);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'log-loadmore';
        btn.className = 'btn';
        btn.textContent = `加载更多 · 还有 ${left} 条`;
        btn.setAttribute('aria-label', `加载更多记录，还有 ${left} 条未显示`);
        btn.addEventListener('click', () => reload({ append: true }));
        more.appendChild(btn);
      } else {
        const done = document.createElement('p');
        done.className = 'hint log-done';
        done.textContent = `已显示全部 ${total} 条`;
        more.appendChild(done);
      }
    }

    /* ---------- 取数并渲染 ---------- */
    function reload({ append = false } = {}) {
      const res = querySessions(params(append ? items.length : 0));
      total = res.total;
      totalMin = res.totalMin;
      hasMore = res.hasMore;
      if (append) {
        items = items.concat(res.items);
      } else {
        items = res.items;
        body.innerHTML = '';
      }
      paintCount();
      if (!total) { renderEmpty(); more.innerHTML = ''; return; }
      renderGroups();
      renderMore();
    }

    function paint() {
      clr.hidden = !query;
      reload({ append: false });
    }

    /* 科目 / 标签增删后，筛选 chips 跟着重建（v1.5 局部刷新也要同步菜谱） */
    function rebuildRails() {
      const filters = root.querySelector('.log-filters');
      if (!filters) return;
      const tagSet = new Set(allTags().map((t) => t.tag));
      if (tag && !tagSet.has(tag)) tag = null;
      if (subjectId && !(getState().subjects || []).some((s) => s.id === subjectId)) subjectId = null;
      filters.querySelectorAll('.log-rail').forEach((el) => el.remove());
      const tpl = document.createElement('template');
      tpl.innerHTML = `${subjectRail()}${tagRail()}`.trim();
      Array.from(tpl.content.children).forEach((el) => filters.appendChild(el));
      syncRail('subject');
      syncRail('tag');
    }

    /* 数据变了（新增 / 修改 / 删除记录）时的局部刷新：保住筛选条件、搜索词、
       已加载的页数与滚动位置，只把列表内容换新（v1.5 不再整页重建） */
    function softReload() {
      rebuildRails();
      const keep = Math.max(PAGE, items.length);
      const res = querySessions(params(0, keep));
      total = res.total;
      totalMin = res.totalMin;
      hasMore = res.hasMore;
      items = res.items;
      paintCount();
      if (!total) { body.innerHTML = ''; renderEmpty(); more.innerHTML = ''; return; }
      renderGroups();
      renderMore();
    }
    softRefresh = softReload;

    /* ---------- chips / seg 选中态 ---------- */
    function syncRail(kind) {
      root.querySelectorAll(`[data-act="${kind}"]`).forEach((b) => {
        const on = kind === 'subject' ? (b.dataset.sid || null) === subjectId : (b.dataset.tag || null) === tag;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function syncRange() {
      root.querySelectorAll('[data-filter]').forEach((b) => {
        const on = b.dataset.filter === range;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function clearFilters() {
      query = '';
      input.value = '';
      subjectId = null;
      tag = null;
      range = 'all';
      syncRange();
      syncRail('subject');
      syncRail('tag');
      paint();
      input.focus();
    }

    /* ---------- 事件：整页委托，追加的记录无需重新绑定 ---------- */
    root.addEventListener('click', (e) => {
      const start = e.target instanceof Element ? e.target : e.target.parentElement;
      if (!start) return;
      const row = start.closest('[data-session]');
      if (row && body.contains(row)) {
        haptic();
        openRecordSheet({ id: row.dataset.session, onChange: () => paint() });
        return;
      }
      const act = start.closest('[data-act]');
      if (!act || !root.contains(act)) return;
      const kind = act.dataset.act;
      if (kind === 'subject') {
        subjectId = act.dataset.sid || null;
        syncRail('subject');
        paint();
      } else if (kind === 'tag') {
        tag = act.dataset.tag || null;
        syncRail('tag');
        paint();
      } else if (kind === 'log-clear') {
        clearFilters();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { query = input.value.trim(); paint(); }, 130);
    });
    clr.addEventListener('click', () => {
      input.value = '';
      query = '';
      paint();
      input.focus();
    });
    root.querySelectorAll('[data-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        if (range === b.dataset.filter) return;
        range = b.dataset.filter;
        syncRange();
        paint();
      });
    });
    root.querySelector('#log-add').addEventListener('click', () => {
      haptic();
      openRecordSheet({ onChange: () => ctx.refresh() });
    });

    syncRange();
    syncRail('subject');
    syncRail('tag');
    paint();
    ctx.onLeave(() => { softRefresh = null; clearTimeout(timer); });
  }

  return {
    title: '学习记录',
    sub: '按时间倒序 · 点一条可修改',
    html,
    mount,
    refresh() { if (softRefresh) softRefresh(); },
  };
}
