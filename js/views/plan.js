/* 学习计划：把任务排到一周的每一天（v1.17）；重复任务与复制上周（v1.18） */
import {
  planWeek, todosOfDay, addTodo, setTodoMinutes, toggleTodo, setTodoDone, removeTodo, removeTodoSeries, copyWeekTodos,
  normRepeat, repeatLabel, getSubject, activeSubjects, dateKey, addDays, parseKey,
  getPlanTemplates, savePlanTemplate, applyPlanTemplate, removePlanTemplate,
} from '../store.js';
import {
  esc, fmtMinShort, weekdayCN, monthDayCN, openSheet, closeSheet, promptSheet, confirmSheet, toast, haptic,
} from '../util.js';
import { openRecordSheet } from '../sheets.js';

const REPEAT_OPTIONS = [
  { id: 'none', label: '不重复', hint: '只在选中的一天' },
  { id: 'daily', label: '每天', hint: '从这天起每天出现' },
  { id: 'weekdays', label: '工作日', hint: '周一到周五出现' },
  { id: 'weekly', label: '每周', hint: '每周的同一天出现' },
];

/* 添加任务弹层：任务内容 + 重复频率 + 可选科目 + 预计时长，返回 { text, repeat, subjectId, minutes } 或 null */
export function openAddTask(key) {
  const d = parseKey(key);
  const subjects = activeSubjects();
  return new Promise((resolve) => {
    let done = false;
    let repeat = 'none';
    let subjectId = null;
    let minutes = 0;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeSheet();
      resolve(val);
    };
    openSheet(
      `<h2 class="sheet-title">添加任务</h2>
      <p class="sheet-desc">${monthDayCN(d)} ${weekdayCN(d)} 要做什么？</p>
      <div class="field">
        <label for="prompt-input">任务内容</label>
        <input class="input" id="prompt-input" maxlength="40" placeholder="例如：复习英语听力 30 分钟" />
      </div>
      <div class="field">
        <label>科目（可选）</label>
        <div class="chips" id="task-subjects" role="group" aria-label="任务科目">
          <button class="chip on" type="button" data-tsid="" aria-pressed="true">不指定</button>
          ${subjects.map((s) => `<button class="chip" type="button" data-tsid="${s.id}" aria-pressed="false">${s.emoji || '📘'} ${esc(s.name)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>重复</label>
        <div class="chips" id="repeat-chips" role="group" aria-label="重复频率">
          ${REPEAT_OPTIONS.map((o) => `<button class="chip${o.id === 'none' ? ' on' : ''}" type="button" data-repeat="${o.id}" aria-pressed="${o.id === 'none' ? 'true' : 'false'}" title="${o.hint}">${o.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>预计时长（可选）</label>
        <div class="chips" id="task-minutes" role="group" aria-label="预计时长">
          ${[0, 15, 30, 45, 60, 90].map((m) => `<button class="chip${m === 0 ? ' on' : ''}" type="button" data-min="${m}" aria-pressed="${m === 0 ? 'true' : 'false'}">${m ? `${m} 分钟` : '不设'}</button>`).join('')}
        </div>
      </div>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="no">取消</button>
        <button class="btn primary" type="button" data-act="yes">添加</button>
      </div>`,
      (sheet) => {
        const input = sheet.querySelector('#prompt-input');
        sheet.querySelectorAll('[data-tsid]').forEach((btn) => {
          btn.addEventListener('click', () => {
            subjectId = btn.dataset.tsid || null;
            sheet.querySelectorAll('[data-tsid]').forEach((b) => {
              const on = b === btn;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
        });
        sheet.querySelectorAll('[data-repeat]').forEach((btn) => {
          btn.addEventListener('click', () => {
            repeat = btn.dataset.repeat;
            sheet.querySelectorAll('[data-repeat]').forEach((b) => {
              const on = b === btn;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
        });
        sheet.querySelectorAll('[data-min]').forEach((btn) => {
          btn.addEventListener('click', () => {
            minutes = Number(btn.dataset.min) || 0;
            sheet.querySelectorAll('[data-min]').forEach((b) => {
              const on = b === btn;
              b.classList.toggle('on', on);
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
          });
        });
        sheet.querySelector('[data-act="no"]').addEventListener('click', () => finish(null));
        sheet.querySelector('[data-act="yes"]').addEventListener('click', () => {
          const text = input.value.trim();
          if (!text) { input.focus(); return; }
          finish({ text, repeat, subjectId, minutes });
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); sheet.querySelector('[data-act="yes"]').click(); }
        });
        setTimeout(() => input.focus(), 150);
      },
    );
  });
}

/* 删除重复任务：返回 'skip' | 'all' | null */
export function openRepeatDeleteSheet(text, repeat, key) {
  const d = parseKey(key);
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      closeSheet();
      resolve(val);
    };
    openSheet(
      `<h2 class="sheet-title">重复任务</h2>
      <p class="sheet-desc">「${esc(text)}」${esc(repeatLabel(repeat))}重复。要只删除 ${monthDayCN(d)} 这一天，还是删除整个重复任务？</p>
      <div class="sheet-actions">
        <button class="btn" type="button" data-act="cancel">取消</button>
        <button class="btn" type="button" data-act="skip">跳过这一天</button>
        <button class="btn danger-solid" type="button" data-act="all">全部删除</button>
      </div>`,
      (sheet) => {
        sheet.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
        sheet.querySelector('[data-act="skip"]').addEventListener('click', () => finish('skip'));
        sheet.querySelector('[data-act="all"]').addEventListener('click', () => finish('all'));
      },
    );
  });
}

/* 存为计划模板：只取任务文本 / 科目 / 预计时长 + 周内第几天，不绑定具体日期 */
async function openSavePlanTemplateSheet(wk) {
  if (!wk.total) { toast('这一周还没有任务'); return null; }
  const name = await promptSheet({
    title: '存为计划模板',
    desc: `把这一周的 ${wk.total} 项任务保存成模板，之后可套用到任意一周。`,
    placeholder: '例如：标准学习周',
    maxlength: 20,
    okText: '保存',
  });
  if (!name) return null;
  const tpl = savePlanTemplate(name, wk.startKey);
  if (!tpl) { toast('保存失败，请重试'); return null; }
  return tpl;
}

/* 计划模板列表：套用 / 删除 */
function openPlanTemplatesSheet(wk, after) {
  const list = getPlanTemplates();
  if (!list.length) { toast('还没有计划模板'); return; }
  const rows = list.map((t) => {
    const days = new Set(t.tasks.map((x) => x.dayOffset)).size;
    return '<div class="plan-tpl-row" data-tpl="' + t.id + '">'
      + '<div class="plan-tpl-main"><b class="plan-tpl-name">' + esc(t.name) + '</b>'
      + '<span class="plan-tpl-meta">' + t.tasks.length + ' 项 · 分布在 ' + days + ' 天</span></div>'
      + '<div class="plan-tpl-actions">'
      + '<button class="btn small primary" type="button" data-act="apply">套用</button>'
      + '<button class="btn small" type="button" data-act="del">删除</button>'
      + '</div></div>';
  }).join('');
  openSheet(
    '<h2 class="sheet-title">计划模板</h2>'
    + '<p class="sheet-desc">选一个模板套用到这一周；同一天已有的同名任务会自动跳过。</p>'
    + '<div class="plan-tpl-list">' + rows + '</div>'
    + '<div class="sheet-actions"><button class="btn" type="button" data-act="close">关闭</button></div>',
    (sheet) => {
      sheet.querySelector('[data-act="close"]').addEventListener('click', () => closeSheet());
      sheet.querySelectorAll('[data-tpl]').forEach((row) => {
        const id = row.dataset.tpl;
        const tpl = list.find((x) => x.id === id);
        row.querySelector('[data-act="apply"]').addEventListener('click', () => {
          const added = applyPlanTemplate(id, wk.startKey);
          closeSheet();
          toast(added ? `已套用 ${added} 项任务` : '这一周已有相同任务');
          if (after) after();
        });
        row.querySelector('[data-act="del"]').addEventListener('click', async () => {
          const ok = await confirmSheet({
            title: '删除计划模板',
            desc: `「${tpl ? tpl.name : ''}」删除后不能恢复。`,
            okText: '删除',
            danger: true,
          });
          if (ok) { removePlanTemplate(id); toast('模板已删除'); }
          openPlanTemplatesSheet(wk, after);
        });
      });
    },
  );
}

export function renderPlan(ctx) {
  const todayKey = dateKey(new Date());
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.week || '')) ? ctx.query.week : todayKey;
  const wk = planWeek(anchor);
  const startDate = parseKey(wk.startKey);
  const thisWeek = wk.startKey === planWeek(todayKey).startKey;
  const rangeText = `${monthDayCN(startDate)} – ${monthDayCN(parseKey(wk.endKey))}`;
  const planTemplates = getPlanTemplates();

  const html = `
    <section class="hero fade-in">
      <div class="hero-label">本周计划</div>
      <div class="hero-value"><b>${wk.done}</b><span>/ ${wk.total} 项</span></div>
      <div class="hero-sub">${rangeText}${wk.total ? ` · 完成率 ${wk.pct}%` : ' · 还没有安排任务'}</div>
      <div class="hero-bar"><i style="width:${wk.pct}%"></i></div>
      <div class="hero-foot">
        <span>本周已学习 ${fmtMinShort(wk.minutes)}${wk.planned ? ` · 预计投入 ${fmtMinShort(wk.planned)}` : ''}</span>
        <span class="hero-links">
          ${thisWeek ? '' : '<button type="button" data-act="this-week">回到本周 →</button>'}
          <button type="button" data-act="copy-last">复制上周计划</button>
        </span>
      </div>
    </section>

    <div class="year-nav plan-nav fade-in" role="group" aria-label="切换周">
      <button class="year-btn" type="button" data-week-step="-1" aria-label="上一周">‹</button>
      <span class="year-label">${rangeText}</span>
      <button class="year-btn" type="button" data-week-step="1" aria-label="下一周">›</button>
    </div>

    <div class="plan-tools fade-in">
      <button class="plan-tool" type="button" data-act="tpl-save"><span>💾</span> 存为本周模板</button>
      <button class="plan-tool" type="button" data-act="tpl-open"><span>📚</span> 计划模板${planTemplates.length ? ` ${planTemplates.length}` : ''}</button>
    </div>

    ${wk.days.map((day) => `
      <section class="card plan-day fade-in${day.isToday ? ' is-today' : ''}" data-plan-day="${day.key}">
        <div class="plan-day-head">
          <div class="plan-day-title">
            <b>${weekdayCN(day.date)}</b>
            <span>${day.date.getMonth() + 1}/${day.date.getDate()}</span>
            ${day.isToday ? '<em>今天</em>' : ''}
          </div>
          <div class="plan-day-meta">${day.planned ? `预计 ${fmtMinShort(day.planned)} · ` : ''}${day.minutes ? `学习 ${fmtMinShort(day.minutes)} · ` : ''}${day.total ? `${day.done}/${day.total} 完成` : '无任务'}</div>
        </div>
        ${day.todos.length ? `<div class="plan-list">
          ${day.todos.map((t) => `
            <div class="plan-task${t.done ? ' done' : ''}" data-plan-task="${t.id}" data-plan-date="${day.key}" data-repeat="${normRepeat(t.repeat)}">
              <button class="plan-check" type="button" data-act="toggle-plan" aria-label="${t.done ? '标记未完成' : '标记完成'}">${t.done ? '✓' : '○'}</button>
              <div class="plan-text">
                <span class="plan-title">${esc(t.text)}</span>
                ${t.subjectId && getSubject(t.subjectId) ? `<span class="plan-subject"><i style="background:${getSubject(t.subjectId).color || 'var(--primary)'}"></i>${getSubject(t.subjectId).emoji || '📘'} ${esc(getSubject(t.subjectId).name)}</span>` : ''}
              </div>
              ${t.minutes ? `<span class="plan-duration">⏱ ${fmtMinShort(t.minutes)}</span>` : ''}
              ${repeatLabel(t.repeat) ? `<span class="plan-repeat">${repeatLabel(t.repeat)}</span>` : ''}
              ${day.key <= todayKey ? '<button class="task-record" type="button" data-act="record-plan" aria-label="记一笔" title="记一笔">✎</button>' : ''}
              <button class="row-chev" type="button" data-act="del-plan" aria-label="删除任务">✕</button>
            </div>`).join('')}
        </div>` : '<p class="plan-empty">没有安排任务</p>'}
        <button class="plan-add" type="button" data-add-day="${day.key}">+ 添加任务</button>
      </section>`).join('')}
  `;

  function mount(root) {
    root.querySelectorAll('[data-week-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = Number(btn.dataset.weekStep) || 0;
        if (!step) return;
        ctx.go('#/plan?week=' + dateKey(addDays(startDate, step * 7)));
      });
    });
    const thisBtn = root.querySelector('[data-act="this-week"]');
    if (thisBtn) thisBtn.addEventListener('click', () => ctx.go('#/plan'));
    const copyBtn = root.querySelector('[data-act="copy-last"]');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const added = copyWeekTodos(dateKey(addDays(startDate, -7)), wk.startKey);
      toast(added ? `已复制 ${added} 项任务` : '上周没有可复制的任务');
    });
    const saveTplBtn = root.querySelector('[data-act="tpl-save"]');
    if (saveTplBtn) saveTplBtn.addEventListener('click', async () => {
      const tpl = await openSavePlanTemplateSheet(wk);
      if (tpl) { toast(`已保存模板「${tpl.name}」`); ctx.refresh(); }
    });
    const openTplBtn = root.querySelector('[data-act="tpl-open"]');
    if (openTplBtn) openTplBtn.addEventListener('click', () => openPlanTemplatesSheet(wk, () => ctx.refresh()));
    root.querySelectorAll('[data-add-day]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.addDay;
        const result = await openAddTask(key);
        if (result) {
          const created = addTodo(result.text, key, result.repeat, result.subjectId);
          if (created && result.minutes) setTodoMinutes(created.id, result.minutes);
          toast(result.repeat === 'none' ? '任务已添加' : `任务已添加 · ${repeatLabel(result.repeat)}重复`);
        }
      });
    });
    root.querySelectorAll('[data-act="record-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const task = btn.closest('[data-plan-task]');
        const key = task.dataset.planDate;
        const id = task.dataset.planTask;
        const item = todosOfDay(key).find((x) => x.id === id);
        if (!item) return;
        haptic();
        openRecordSheet({
          initial: { title: item.text, subjectId: item.subjectId || undefined, dateKey: key },
          onChange: () => {
            setTodoDone(id, key, true);
            ctx.refresh();
            toast('已记一笔 · 任务完成 ✓');
          },
        });
      });
    });
    root.querySelectorAll('[data-act="toggle-plan"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        haptic();
        const task = btn.closest('[data-plan-task]');
        toggleTodo(task.dataset.planTask, task.dataset.planDate);
      });
    });
    root.querySelectorAll('[data-act="del-plan"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const task = btn.closest('[data-plan-task]');
        const id = task.dataset.planTask;
        const key = task.dataset.planDate;
        if (normRepeat(task.dataset.repeat) === 'none') {
          removeTodo(id, key);
          return;
        }
        const item = todosOfDay(key).find((x) => x.id === id);
        const action = await openRepeatDeleteSheet(item ? item.text : '', task.dataset.repeat, key);
        if (action === 'skip') {
          removeTodo(id, key);
          toast('已跳过这一天');
        } else if (action === 'all') {
          removeTodoSeries(id);
          toast('已删除整个重复任务');
        }
      });
    });
  }

  return { title: '学习计划', sub: '把这一周安排好', html, mount };
}
