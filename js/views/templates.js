/* 常用模板管理（v1.31）：查看全部模板、编辑、删除、清空、一键使用 */
import {
  getTemplates, getSubject, getState, addTemplate, updateTemplate,
  removeTemplate, clearTemplates, touchTemplate, normTags,
} from '../store.js';
import { esc, haptic, toast, openSheet, closeSheet, confirmSheet, relativeDay, fmtMinShort } from '../util.js';
import { openRecordSheet } from '../sheets.js';

function subjectOf(tpl) {
  const s = tpl && tpl.subjectId ? getSubject(tpl.subjectId) : null;
  if (!s) return { emoji: '📘', name: '未分类', color: 'var(--text-3)' };
  return { emoji: s.emoji || '📘', name: s.name, color: s.color || 'var(--primary)' };
}

function whenText(ts) {
  if (!ts) return '还没用过';
  return '最近使用 · ' + relativeDay(new Date(ts));
}

function tagHtml(tags) {
  if (!tags || !tags.length) return '';
  return '<div class="tpl-tags">' + tags.map(function (t) {
    return '<span class="tpl-tag">#' + esc(t) + '</span>';
  }).join('') + '</div>';
}

function cardHtml(t) {
  const sub = subjectOf(t);
  const meta = [];
  if (t.minutes > 0) meta.push(fmtMinShort(t.minutes));
  meta.push(whenText(t.usedAt));
  return '<article class="tpl-card fade-in" data-tpl-id="' + esc(t.id) + '">'
    + '<div class="tpl-head">'
    + '<span class="tpl-subject"><span class="tpl-dot" style="background:' + sub.color + '"></span>' + sub.emoji + ' ' + esc(sub.name) + '</span>'
    + '<span class="tpl-when">' + esc(meta.join(' · ')) + '</span>'
    + '</div>'
    + '<h3 class="tpl-title">' + esc(t.title) + '</h3>'
    + tagHtml(t.tags)
    + '<div class="tpl-actions">'
    + '<button class="btn primary tpl-use" type="button" data-use="' + esc(t.id) + '">用这个记一笔</button>'
    + '<button class="btn tpl-edit" type="button" data-edit="' + esc(t.id) + '">编辑</button>'
    + '<button class="btn danger tpl-del" type="button" data-del="' + esc(t.id) + '">删除</button>'
    + '</div>'
    + '</article>';
}

export function renderTemplates(ctx) {
  const list = getTemplates();
  const used = list.filter(function (t) { return t.usedAt; }).length;
  const empty = !list.length;

  const hero = '<section class="hero tpl-hero fade-in">'
    + '<div class="hero-label">常用模板</div>'
    + '<div class="hero-value"><b>' + list.length + '</b><span>条模板</span></div>'
    + '<div class="hero-sub">' + (empty
      ? '把常记的内容存成模板，下次少打几个字'
      : '记一笔时点一下模板，科目、内容和时长就都带出来了') + '</div>'
    + '<div class="hero-foot"><span>' + (empty ? '最多保留 20 条' : '已用过 ' + used + ' 条 · 最多 20 条') + '</span>'
    + '<button type="button" data-new>+ 新建模板 →</button></div>'
    + '</section>';

  const body = empty
    ? '<section class="card tpl-empty fade-in"><div class="empty" style="padding:30px 18px">'
      + '<span class="em">⚡</span>'
      + '<p>还没有常用模板<br/>记一笔时点「存为模板」，或者直接新建一个</p>'
      + '<button class="btn primary" type="button" data-new>+ 新建模板</button>'
      + '</div></section>'
    : '<div class="card-title" style="padding:4px 6px"><h3>全部模板</h3><span class="more">' + list.length + ' / 20</span></div>'
      + '<div class="tpl-list">' + list.map(cardHtml).join('') + '</div>'
      + '<button class="tpl-clear" type="button" data-clear>清空全部模板</button>';

  const html = hero + body;

  function mount(root) {
    root.querySelectorAll('[data-new]').forEach(function (el) {
      el.addEventListener('click', function () { haptic(); openTemplateEditor(null, function () { ctx.refresh(); }); });
    });

    root.querySelectorAll('[data-use]').forEach(function (el) {
      el.addEventListener('click', function () {
        const tpl = getTemplates().find(function (t) { return t.id === el.dataset.use; });
        if (!tpl) return;
        haptic();
        touchTemplate(tpl.id);
        openRecordSheet({
          initial: { subjectId: tpl.subjectId, title: tpl.title, minutes: tpl.minutes, tags: tpl.tags },
          onChange: function () { ctx.refresh(); },
          onSaved: function () { ctx.refresh(); },
        });
      });
    });

    root.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        haptic();
        openTemplateEditor(el.dataset.edit, function () { ctx.refresh(); });
      });
    });

    root.querySelectorAll('[data-del]').forEach(function (el) {
      el.addEventListener('click', async function () {
        const tpl = getTemplates().find(function (t) { return t.id === el.dataset.del; });
        if (!tpl) return;
        const ok = await confirmSheet({
          title: '删除这条模板？',
          desc: '「' + tpl.title + '」删掉后不再出现在记一笔的模板里，已记下的学习记录不受影响。',
          okText: '删除',
          danger: true,
        });
        if (!ok) return;
        removeTemplate(tpl.id);
        haptic();
        toast('模板已删除');
        ctx.refresh();
      });
    });

    const clear = root.querySelector('[data-clear]');
    if (clear) clear.addEventListener('click', async function () {
      const ok = await confirmSheet({
        title: '清空全部模板？',
        desc: '共 ' + getTemplates().length + ' 条模板会被删除，已记下的学习记录不受影响。',
        okText: '清空',
        danger: true,
      });
      if (!ok) return;
      const n = clearTemplates();
      haptic();
      toast('已清空 ' + n + ' 条模板');
      ctx.refresh();
    });
  }

  return { title: '常用模板', sub: '把常记的内容存下来，记一笔时一键填好', html, mount };
}

function openTemplateEditor(id, onChange) {
  const editing = Boolean(id);
  const tpl = editing ? getTemplates().find(function (t) { return t.id === id; }) : null;
  if (editing && !tpl) { toast('模板不存在'); return; }

  const allSubs = getState().subjects.filter(function (s) { return !s.archived || (tpl && s.id === tpl.subjectId); });
  let sid = tpl ? (tpl.subjectId || null) : null;

  const subChips = '<button class="chip' + (sid ? '' : ' on') + '" type="button" data-tsid="">不指定</button>'
    + allSubs.map(function (s) {
      return '<button class="chip' + (s.id === sid ? ' on' : '') + '" type="button" data-tsid="' + s.id + '">'
        + s.emoji + ' ' + esc(s.name) + (s.archived ? ' (已归档)' : '') + '</button>';
    }).join('');

  const minVal = tpl && tpl.minutes > 0 ? String(tpl.minutes) : '';
  const tagsVal = tpl ? (tpl.tags || []).join(' ') : '';

  openSheet(
    '<h2 class="sheet-title">' + (editing ? '编辑模板' : '新建模板') + '</h2>'
    + '<p class="sheet-desc">模板只保存科目、内容和时长；点「用这个记一笔」时自动带进表单。</p>'
    + '<div class="field"><label>科目</label><div class="chips" id="te-subjects">' + subChips + '</div></div>'
    + '<div class="field"><label for="te-title">学了什么</label><input class="input" id="te-title" maxlength="40" placeholder="例如：第三章 导数计算" value="' + esc(tpl ? tpl.title : '') + '" /></div>'
    + '<div class="field"><label for="te-min">时长（分钟，可留空）</label><input class="input" id="te-min" type="number" min="0" max="1440" inputmode="numeric" placeholder="例如：30" value="' + minVal + '" /></div>'
    + '<div class="field"><label for="te-tags">标签（空格分隔，最多 6 个）</label><input class="input" id="te-tags" placeholder="例如：复习 重点" value="' + esc(tagsVal) + '" /></div>'
    + '<div class="sheet-actions"><button class="btn" type="button" data-act="te-cancel">取消</button><button class="btn primary" type="button" data-act="te-save">保存模板</button></div>',
    function (sheet) {
      const titleInput = sheet.querySelector('#te-title');
      const minInput = sheet.querySelector('#te-min');
      const tagInput = sheet.querySelector('#te-tags');
      const chipBox = sheet.querySelector('#te-subjects');

      chipBox.addEventListener('click', function (e) {
        const chip = e.target.closest('[data-tsid]');
        if (!chip) return;
        sid = chip.getAttribute('data-tsid') || null;
        chipBox.querySelectorAll('[data-tsid]').forEach(function (x) { x.classList.toggle('on', x === chip); });
      });

      sheet.querySelector('[data-act="te-cancel"]').addEventListener('click', closeSheet);
      sheet.querySelector('[data-act="te-save"]').addEventListener('click', function () {
        const title = titleInput.value.trim();
        if (!title) { toast('先写一句「学了什么」'); titleInput.focus(); return; }
        const dup = getTemplates().some(function (t) { return t.id !== id && (t.title || '').trim() === title; });
        if (dup) { toast('已经有同名模板了'); titleInput.focus(); return; }
        const raw = minInput.value.trim();
        const minutes = raw === '' ? 0 : Math.max(0, Math.round(Number(raw) || 0));
        const tags = normTags(tagInput.value);
        const saved = editing
          ? updateTemplate(id, { subjectId: sid, title: title, minutes: minutes, tags: tags })
          : addTemplate({ subjectId: sid, title: title, minutes: minutes, tags: tags });
        if (!saved) { toast('保存失败，检查一下内容'); return; }
        closeSheet();
        haptic();
        toast(editing ? '模板已保存' : '已新建模板');
        if (onChange) onChange();
      });

      setTimeout(function () { titleInput.focus(); }, 120);
    },
  );
}
