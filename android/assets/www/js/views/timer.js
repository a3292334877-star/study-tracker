/* 计时视图：专注=正计时，休息=倒计时。计时是「记一笔」的辅助工具 */
import {
  MODES, subscribeTimer, getTimer, elapsedMs, displayMs, progress,
  start, pause, reset, finish, configure, setSubject, requestNotifyPermission,
} from '../timer.js';
import { getState, getSubject, activeSubjects } from '../store.js';
import { esc, fmtClock, fmtMinShort, openSheet, closeSheet, toast, haptic, confirmSheet } from '../util.js';
import { openRecordSheet } from '../sheets.js';

const R = 112;
const C = 2 * Math.PI * R;
const PRESETS = [15, 25, 45, 60];

export function renderTimer(ctx) {
  const html = `
    <div class="timer-wrap fade-in">
      <div class="chips" id="mode-chips" style="margin-bottom:10px">
        ${Object.entries(MODES).map(([k, v]) => `<button class="chip" type="button" data-mode="${k}">${v.label}</button>`).join('')}
      </div>

      <div class="ring">
        <svg viewBox="0 0 260 260">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4f6df5"/>
              <stop offset="100%" stop-color="#7d5cff"/>
            </linearGradient>
          </defs>
          <circle class="track" cx="130" cy="130" r="${R}"/>
          <circle class="prog" id="ring-prog" cx="130" cy="130" r="${R}"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        </svg>
        <div class="ring-center">
          <div class="ring-time" id="ring-time">00:00</div>
          <div class="ring-state" id="ring-state">准备开始</div>
        </div>
      </div>

      <div class="seg seg-sm" id="style-seg">
        <button type="button" data-style="up">正计时</button>
        <button type="button" data-style="down">倒计时</button>
      </div>

      <button class="timer-subject" type="button" id="subject-pick">
        <span class="dot" id="subject-dot" style="background:#4f6df5"></span>
        <span id="subject-name">选择科目</span>
        <svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px;color:var(--text-3)"><path d="m9 6 6 6-6 6"/></svg>
      </button>

      <div class="timer-actions">
        <button class="btn-round" type="button" id="btn-reset" aria-label="结束">↺</button>
        <button class="btn primary" type="button" id="btn-main">开始</button>
        <button class="btn-round" type="button" id="btn-more" aria-label="更多">⋯</button>
      </div>

      <div class="chips" id="preset-chips" style="margin-top:20px">
        ${PRESETS.map((m) => `<button class="chip" type="button" data-preset="${m}">${m} 分钟</button>`).join('')}
      </div>
      <p class="hint" id="timer-hint" style="text-align:center;margin-top:14px"></p>
    </div>

    <section class="card fade-in mt16">
      <div class="card-title"><h3>只想记一笔？</h3></div>
      <p class="hint">不用计时也能记：写下学了什么就行，时长可以留空。</p>
      <button class="btn block mt16" type="button" id="btn-manual">+ 记一笔学习</button>
    </section>
  `;

  let unsub = null;
  let lastSig = '';

  function paint() {
    const t = getTimer();
    const root = document.getElementById('view');
    if (!root) return;
    const timeEl = root.querySelector('#ring-time');
    if (!timeEl) return;

    /* 心跳每 500ms 触发一次，但「看见的东西」往往没变（正计时时秒数一秒
       才跳一次，环形进度几乎不动）——签名没变就跳过整块 DOM 重排（v1.5） */
    const sig = [
      t.mode, t.style, t.status, t.targetMs, t.subjectId || '',
      Math.floor(displayMs() / 1000),
      Math.round(progress() * 1000),
      activeSubjects().length,
    ].join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    const stateEl = root.querySelector('#ring-state');
    const progEl = root.querySelector('#ring-prog');
    const mainBtn = root.querySelector('#btn-main');
    const subName = root.querySelector('#subject-name');
    const subDot = root.querySelector('#subject-dot');
    const hintEl = root.querySelector('#timer-hint');
    const segEl = root.querySelector('#style-seg');

    timeEl.textContent = fmtClock(displayMs());
    stateEl.textContent =
      t.status === 'running' ? (t.mode === 'focus' ? '专注中' : '休息中')
        : t.status === 'paused' ? '已暂停'
          : t.mode === 'focus' ? '准备开始' : '准备休息';

    progEl.setAttribute('stroke-dashoffset', (C * (1 - progress())).toFixed(1));
    mainBtn.textContent = t.status === 'running' ? '暂停' : t.status === 'paused' ? '继续' : '开始';

    root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === t.mode));
    root.querySelectorAll('[data-preset]').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.preset) * 60000 === t.targetMs && t.mode === 'focus' && t.style === 'down');
    });
    root.querySelectorAll('[data-style]').forEach((b) => b.classList.toggle('on', b.dataset.style === t.style));

    segEl.style.display = t.mode === 'focus' ? '' : 'none';
    segEl.querySelectorAll('[data-style]').forEach((b) => {
      const disabled = t.status === 'running';
      b.disabled = disabled;
      b.style.opacity = disabled ? '.45' : '';
    });

    const presetWrap = root.querySelector('#preset-chips');
    presetWrap.style.display = t.mode === 'focus' && t.style === 'down' ? '' : 'none';

    hintEl.textContent = t.mode === 'focus'
      ? (t.style === 'up' ? '正计时：记录真实专注时长，可随时结束' : `倒计时：${Math.round(t.targetMs / 60000)} 分钟后自动结束并记录`)
      : `休息 ${Math.round(t.targetMs / 60000)} 分钟，结束后不会记入学习时长`;

    const subject = getSubject(t.subjectId) || activeSubjects()[0] || null;
    if (subject) {
      subName.textContent = subject.name;
      subDot.style.background = subject.color;
    } else {
      subName.textContent = '未选择科目';
      subDot.style.background = 'var(--text-3)';
    }
  }

  /* 计时结束后立刻让用户补「学了什么」——这才是记录的核心 */
  function askWhatStudied(result) {
    if (!result || !result.sessionId) return;
    openRecordSheet({
      id: result.sessionId,
      heading: '这次学了什么？',
      desc: `已记 ${fmtMinShort(result.minutes)}，补一句内容就完整了。`,
      onChange: () => ctx.refresh(),
    });
  }

  function stopAndLog(early) {
    const res = finish({ early });
    if (res.ok) {
      toast(`已记 ${fmtMinShort(res.minutes)}`);
      askWhatStudied(res);
    } else {
      toast('已重置');
    }
    ctx.refresh();
    return res;
  }

  function mount(root) {
    paint();
    unsub = subscribeTimer((t, meta) => {
      paint();
      if (meta && meta.completed) {
        if (meta.result && meta.result.ok) {
          toast(`专注完成 · ${fmtMinShort(meta.result.minutes)}`);
          askWhatStudied(meta.result);
        } else {
          toast('休息结束');
        }
        ctx.refresh();
      }
    });
    if (unsub) ctx.onLeave(unsub);

    root.querySelector('#btn-main').addEventListener('click', () => {
      haptic();
      const t = getTimer();
      if (t.status === 'running') { pause(); return; }
      requestNotifyPermission();
      if (!t.subjectId && activeSubjects().length) setSubject(activeSubjects()[0].id);
      start();
    });

    root.querySelector('#btn-reset').addEventListener('click', async () => {
      const t = getTimer();
      const used = elapsedMs();
      if (t.status === 'idle' && used === 0) return;
      if (t.mode === 'focus' && used >= 60000) {
        const ok = await confirmSheet({
          title: '结束本次专注？',
          desc: `已专注 ${Math.round(used / 60000)} 分钟，结束后会记入今天。`,
          okText: '结束并记录',
        });
        if (ok) stopAndLog(true);
        return;
      }
      reset();
      toast('已重置');
      ctx.refresh();
    });

    root.querySelector('#btn-more').addEventListener('click', () => {
      const t = getTimer();
      openSheet(`
        <h2 class="sheet-title">更多选项</h2>
        <p class="sheet-desc">调整专注目标时长，立即生效。</p>
        <div class="field">
          <label>专注时长（分钟）</label>
          <input class="input" id="dur-input" type="number" min="1" max="180" value="${Math.round(t.targetMs / 60000)}" />
        </div>
        <div class="sheet-actions">
          <button class="btn" type="button" data-act="close">取消</button>
          <button class="btn primary" type="button" data-act="ok">确定</button>
        </div>
      `, (sheet) => {
        sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
        sheet.querySelector('[data-act="ok"]').addEventListener('click', () => {
          const v = Number(sheet.querySelector('#dur-input').value);
          if (!v || v < 1) { toast('请输入有效时长'); return; }
          if (getTimer().status === 'running') { toast('请先暂停当前计时'); return; }
          configure({ mode: 'focus', targetMin: v });
          closeSheet();
          paint();
        });
      });
    });

    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => {
        haptic();
        const mode = b.dataset.mode;
        if (getTimer().status === 'running') { toast('请先暂停当前计时'); return; }
        if (mode === getTimer().mode && getTimer().accumulatedMs === 0) return;
        configure({ mode });
        paint();
      });
    });

    root.querySelectorAll('[data-style]').forEach((b) => {
      b.addEventListener('click', () => {
        if (getTimer().status === 'running') { toast('请先暂停当前计时'); return; }
        configure({ style: b.dataset.style });
        paint();
      });
    });

    root.querySelectorAll('[data-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        if (getTimer().status === 'running') { toast('请先暂停当前计时'); return; }
        configure({ mode: 'focus', style: 'down', targetMin: Number(b.dataset.preset) });
        paint();
      });
    });

    root.querySelector('#subject-pick').addEventListener('click', () => {
      const subjects = activeSubjects();
      if (!subjects.length) { location.hash = '#/subjects'; return; }
      openSheet(`
        <h2 class="sheet-title">选择科目</h2>
        <p class="sheet-desc">本次专注会记到这个科目下。</p>
        <div class="list">
          ${subjects.map((s) => `<button class="row" type="button" data-sid="${s.id}">
            <div class="row-ic" style="background:${s.color}18;color:${s.color}">${s.emoji}</div>
            <div class="row-main"><div class="row-title">${esc(s.name)}</div></div>
            <div class="row-chev">›</div>
          </button>`).join('')}
        </div>
      `, (sheet) => {
        sheet.querySelectorAll('[data-sid]').forEach((b) => {
          b.addEventListener('click', () => {
            setSubject(b.dataset.sid);
            closeSheet();
            paint();
          });
        });
      });
    });

    root.querySelector('#btn-manual').addEventListener('click', () => {
      openRecordSheet({ onChange: () => ctx.refresh() });
    });
  }

  return {
    title: '计时',
    sub: '专注时顺手记下学了什么',
    html,
    mount,
    cleanup: () => { if (unsub) { unsub(); unsub = null; } },
  };
}
