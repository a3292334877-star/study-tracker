/* 我的 / 设置 */
import {
  getState, setSetting, exportJSON, importJSON, resetAll,
  listBackups, saveBackupSnapshot, removeBackup, restoreBackup,
  clearDemo, hasDemoData,
} from '../store.js';
import {
  applyTheme, openSheet, closeSheet, toast, fmtMinShort, dateKey,
  confirmSheet, esc, haptic, hhmm, monthDayCN,
} from '../util.js';
import { isStandalone, canInstall, promptInstall, manualSteps } from '../install.js';
import { requestNotifyPermission } from '../timer.js';

export function renderMe(ctx) {
  const state = getState();
  const totalMin = state.sessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalDays = new Set(state.sessions.map((s) => dateKey(new Date(s.end)))).size;
  const subjectCount = state.subjects.length;

  const html = `
    <section class="card fade-in" style="display:flex;align-items:center;gap:14px">
      <div class="row-ic" style="width:52px;height:52px;border-radius:17px;font-size:24px;background:var(--primary-soft);color:var(--primary)">🎓</div>
      <div style="flex:1;min-width:0">
        <div class="row-title" style="font-size:16px">我的学习档案</div>
        <div class="row-sub">${state.sessions.length} 条记录 · ${totalDays} 天 · 累计 ${fmtMinShort(totalMin)}</div>
      </div>
    </section>

    <div class="section-label">目标</div>
    <section class="card flat fade-in">
      <div class="row" data-set="dailyGoalMin">
        <div class="row-ic">🎯</div>
        <div class="row-main">
          <div class="row-title">每日目标</div>
          <div class="row-sub">完成后首页显示达成</div>
        </div>
        <div class="row-val">${state.settings.dailyGoalMin} 分</div>
      </div>
      <div class="row" data-set="pomodoroMin">
        <div class="row-ic">⏱️</div>
        <div class="row-main">
          <div class="row-title">默认专注时长</div>
          <div class="row-sub">计时页倒计时的默认值</div>
        </div>
        <div class="row-val">${state.settings.pomodoroMin} 分</div>
      </div>
    </section>

    <div class="section-label">外观</div>
    <section class="card flat fade-in">
      <div class="row" data-set="theme">
        <div class="row-ic">🌗</div>
        <div class="row-main">
          <div class="row-title">主题</div>
          <div class="row-sub">跟随系统 / 浅色 / 深色</div>
        </div>
        <div class="row-val">${({ auto: '跟随系统', light: '浅色', dark: '深色' })[state.settings.theme] || '跟随系统'}</div>
      </div>
      <div class="row" data-set="weekStart">
        <div class="row-ic">📅</div>
        <div class="row-main">
          <div class="row-title">每周起始日</div>
          <div class="row-sub">影响统计的「本周」</div>
        </div>
        <div class="row-val">${state.settings.weekStart === 1 ? '周一' : '周日'}</div>
      </div>
    </section>

    <div class="section-label">应用</div>
    <section class="card flat fade-in">
      ${(window.AndroidApp || isStandalone()) ? `
      <div class="row">
        <div class="row-ic">📱</div>
        <div class="row-main"><div class="row-title">${window.AndroidApp ? 'Android 应用' : '已添加到主屏幕'}</div><div class="row-sub">${window.AndroidApp ? '数据保存在本机，可随时导出' : '正以独立 App 方式运行'}</div></div>
        <div class="row-val" style="color:var(--primary)">✓</div>
      </div>` : `
      <button class="row" type="button" data-act="install">
        <div class="row-ic">📱</div>
        <div class="row-main"><div class="row-title">添加到主屏幕</div><div class="row-sub">${canInstall() ? '一键安装，像 App 一样打开' : '全屏运行，离线也能用'}</div></div>
        <div class="row-chev">›</div>
      </button>`}
      <button class="row" type="button" data-act="notify">
        <div class="row-ic">🔔</div>
        <div class="row-main"><div class="row-title">计时结束提醒</div><div class="row-sub">切到后台也能收到通知</div></div>
        <div class="row-val">${notifyStateText()}</div>
      </button>
    </section>

    <div class="section-label">工具</div>
    <section class="card flat fade-in">
      <button class="row" type="button" data-act="subjects">
        <div class="row-ic">📚</div>
        <div class="row-main"><div class="row-title">科目管理</div><div class="row-sub">${subjectCount} 个科目 · 新建 / 改名 / 换颜色</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="timer">
        <div class="row-ic">⏱️</div>
        <div class="row-main"><div class="row-title">专注计时</div><div class="row-sub">想掐时间的时候用，结束自动落一条记录</div></div>
        <div class="row-chev">›</div>
      </button>
    </section>

    <div class="section-label">数据</div>
    <section class="card flat fade-in">
      <button class="row" type="button" data-act="autobackup">
        <div class="row-ic">🛡️</div>
        <div class="row-main"><div class="row-title">自动备份</div><div class="row-sub" id="backup-sub">${backupStatusText()}</div></div>
        <div class="row-val" style="color:var(--primary)">${state.settings.autoBackup === false ? '关' : '开'}</div>
      </button>
      <button class="row" type="button" data-act="backup-now">
        <div class="row-ic">💾</div>
        <div class="row-main"><div class="row-title">立即备份</div><div class="row-sub">起个名字存一份快照</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="backups" aria-label="备份快照，共 ${backupCount()} 份">
        <div class="row-ic">🗂️</div>
        <div class="row-main">
          <div class="row-title">备份快照</div>
          <div class="row-sub" id="restore-sub">${backupRestoreText()}</div>
        </div>
        <div class="row-val" id="backup-count">${backupCount()} 份</div>
      </button>
      <button class="row" type="button" data-act="export">
        <div class="row-ic">📤</div>
        <div class="row-main"><div class="row-title">导出数据</div><div class="row-sub">保存为 JSON 备份</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="import">
        <div class="row-ic">📥</div>
        <div class="row-main"><div class="row-title">导入数据</div><div class="row-sub">从备份文件恢复，可合并或覆盖</div></div>
        <div class="row-chev">›</div>
      </button>
      ${hasDemoData() ? `<button class="row" type="button" data-act="clear-demo">
        <div class="row-ic">🧪</div>
        <div class="row-main"><div class="row-title">移除示例数据</div><div class="row-sub">只删第一次打开时的示例内容，自己的都保留</div></div>
        <div class="row-chev">›</div>
      </button>` : ''}
      <button class="row" type="button" data-act="reset">
        <div class="row-ic">🧹</div>
        <div class="row-main"><div class="row-title" style="color:var(--danger)">清空所有数据</div><div class="row-sub">不可恢复，清空之前会自动存一份快照</div></div>
        <div class="row-chev">›</div>
      </button>
    </section>

    <p class="hint center" style="margin-top:22px;line-height:1.9">
      数据仅保存在本机${window.AndroidApp ? ' App' : '浏览器'}<br/>
      学习记录 v1.6 · ${window.AndroidApp ? 'Android 应用' : '可以添加到主屏幕使用'}
    </p>
  `;

  function mount(root) {
    root.querySelectorAll('[data-set]').forEach((row) => {
      row.addEventListener('click', () => openSetting(row.dataset.set, ctx));
    });
    const installRow = root.querySelector('[data-act="install"]');
    if (installRow) installRow.addEventListener('click', openInstallSheet);
    root.querySelector('[data-act="notify"]').addEventListener('click', () => askNotify(ctx));
    root.querySelector('[data-act="subjects"]').addEventListener('click', () => ctx.go('#/subjects'));
    root.querySelector('[data-act="timer"]').addEventListener('click', () => ctx.go('#/timer'));
    const abRow = root.querySelector('[data-act="autobackup"]');
    if (abRow) abRow.addEventListener('click', () => toggleAutoBackup(ctx));
    const bnRow = root.querySelector('[data-act="backup-now"]');
    if (bnRow) bnRow.addEventListener('click', () => openBackupNameSheet(ctx));
    const bkRow = root.querySelector('[data-act="backups"]');
    if (bkRow) bkRow.addEventListener('click', () => openBackupsSheet(ctx));
    root.querySelector('[data-act="export"]').addEventListener('click', doExport);
    root.querySelector('[data-act="import"]').addEventListener('click', () => doImport(ctx));
    const demoRow = root.querySelector('[data-act="clear-demo"]');
    if (demoRow) demoRow.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: '移除示例数据？',
        desc: '会删掉第一次打开时预置的示例科目、记录和任务；你自己记的内容不受影响。',
        okText: '移除', danger: false,
      });
      if (!ok) return;
      const removed = clearDemo();
      haptic();
      toast(removed ? '已移除 ' + removed + ' 条示例记录' : '示例数据已移除');
      ctx.refresh();
    });
    root.querySelector('[data-act="reset"]').addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: '清空所有数据？',
        desc: '科目、学习记录和任务都会被删除。清空前会自动存一份保护快照，之后可以在「备份快照」里找回来。建议先导出备份。',
        okText: '清空', danger: true,
      });
      if (!ok) return;
      resetAll();
      toast('已清空');
      ctx.refresh();
    });
  }

  return { title: '我的', sub: '记录 · 坚持 · 成长', html, mount };
}

function androidBridge() {
  const a = typeof window !== 'undefined' ? window.AndroidApp : null;
  return a && typeof a.notifPermissionGranted === 'function' ? a : null;
}

function notifyStateText() {
  const bridge = androidBridge();
  if (bridge) {
    try { return bridge.notifPermissionGranted() ? '已开启' : '未授权'; } catch (_) { return '已开启'; }
  }
  try {
    if (!('Notification' in window)) return '不支持';
    const p = Notification.permission;
    if (p === 'granted') return '已开启';
    if (p === 'denied') return '已拒绝';
    return '未开启';
  } catch (_) { return '不支持'; }
}

async function askNotify(ctx) {
  const bridge = androidBridge();
  if (bridge) {
    let granted = true;
    try { granted = bridge.notifPermissionGranted(); } catch (_) {}
    if (granted) { toast('已开启：计时进行时通知栏常驻显示'); return; }
    try { bridge.openNotifSettings(); } catch (_) {}
    toast('请在通知设置里允许「学习记录」');
    return;
  }
  let perm = 'unsupported';
  try {
    if (!('Notification' in window)) { toast('当前浏览器不支持通知'); return; }
    perm = Notification.permission;
    if (perm === 'granted') { toast('通知已开启'); return; }
    if (perm === 'denied') {
      await confirmSheet({
        title: '通知已被拒绝',
        desc: '需要到浏览器的网站设置里手动允许通知，之后计时结束才会提醒你。',
        okText: '知道了', cancelText: '关闭',
      });
      return;
    }
    requestNotifyPermission();
    perm = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(Notification.permission), 3000);
      const iv = setInterval(() => {
        if (Notification.permission !== 'default') { clearInterval(iv); clearTimeout(t); resolve(Notification.permission); }
      }, 200);
    });
  } catch (_) { /* 忽略 */ }
  if (perm === 'granted') {
    toast('通知已开启');
  } else if (perm === 'denied') {
    await confirmSheet({
      title: '通知被浏览器拦下了',
      desc: '请在浏览器地址栏左侧的站点信息里，把「通知」改为允许，之后计时结束才会提醒你。',
      okText: '知道了', cancelText: '关闭',
    });
  } else {
    toast('未开启通知');
  }
  if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
}

function openInstallSheet() {
  const steps = manualSteps();
  const native = canInstall();
  openSheet(`
    <h2 class="sheet-title">${esc(steps.title)}</h2>
    <p class="sheet-desc">${esc(steps.lead)}</p>
    <ol class="steps">
      ${steps.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
    </ol>
    <p class="hint" style="margin-top:12px">${esc(steps.note)}</p>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="close">关闭</button>
      ${native ? '<button class="btn primary" type="button" data-act="install">立即安装</button>' : ''}
    </div>
  `, (sheet) => {
    sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
    const btn = sheet.querySelector('[data-act="install"]');
    if (btn) {
      btn.addEventListener('click', async () => {
        const res = await promptInstall();
        if (res === 'accepted') { closeSheet(); toast('已安装到主屏幕'); }
        else if (res === 'unavailable') toast('请按上面的步骤手动添加');
      });
    }
  });
}

function openSetting(key, ctx) {
  const state = getState();
  const configs = {
    dailyGoalMin: {
      title: '每日目标', desc: '每天想学习多少分钟？',
      value: state.settings.dailyGoalMin, min: 10, max: 720, step: 10, unit: '分钟',
    },
    pomodoroMin: {
      title: '默认专注时长', desc: '开始新的专注时使用这个时长。',
      value: state.settings.pomodoroMin, min: 5, max: 120, step: 5, unit: '分钟',
    },
    theme: { title: '主题', desc: '选择界面外观。', options: [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']], value: state.settings.theme },
    weekStart: { title: '每周起始日', desc: '统计里的「本周」从哪天开始。', options: [[1, '周一'], [0, '周日']], value: state.settings.weekStart },
  };
  const cfg = configs[key];
  if (!cfg) return;

  const body = `
    <h2 class="sheet-title">${cfg.title}</h2>
    <p class="sheet-desc">${cfg.desc}</p>
    ${cfg.options ? `<div class="chips" id="opt-wrap">
      ${cfg.options.map(([v, label]) => `<button class="chip${String(v) === String(cfg.value) ? ' on' : ''}" type="button" data-opt="${v}">${label}</button>`).join('')}
    </div>` : `
      <div class="field">
        <label>数值（${cfg.unit}）</label>
        <input class="input" id="num-input" type="number" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${cfg.value}" />
      </div>
    `}
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="cancel">取消</button>
      <button class="btn primary" type="button" data-act="ok">保存</button>
    </div>
  `;

  openSheet(body, (sheet) => {
    let picked = cfg.value;
    if (cfg.options) {
      sheet.querySelectorAll('[data-opt]').forEach((b) => {
        b.addEventListener('click', () => {
          picked = b.dataset.opt;
          sheet.querySelectorAll('[data-opt]').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
    }
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="ok"]').addEventListener('click', () => {
      let value = picked;
      if (!cfg.options) {
        value = Number(sheet.querySelector('#num-input').value);
        if (!value || value < cfg.min || value > cfg.max) { toast('请输入 ' + cfg.min + ' - ' + cfg.max); return; }
      } else if (key === 'weekStart') {
        value = Number(value);
      }
      setSetting(key, value);
      if (key === 'theme') applyTheme(value);
      closeSheet();
      toast('已保存');
      ctx.refresh();
    });
  });
}

function doExport() {
  try {
    // Android 壳：走原生写入下载目录
    if (window.AndroidApp && window.AndroidApp.saveFile) {
      window.AndroidApp.saveFile(`学习记录-${dateKey()}.json`, exportJSON());
      toast('已导出到下载目录');
      return;
    }
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学习记录-${dateKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出备份文件');
  } catch (err) {
    console.error(err);
    toast('导出失败');
  }
}

/* ---------- 导入：合并 / 覆盖 ---------- */
function doImport(ctx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let data = null;
      try { data = JSON.parse(text); } catch (_) { data = null; }
      // 先做一次结构校验，格式不对就不用让用户白选一次导入方式
      if (!data || typeof data !== 'object'
        || (!Array.isArray(data.subjects) && !Array.isArray(data.sessions))) {
        toast('备份文件格式不对');
        return;
      }
      openImportModeSheet(text, data, ctx);
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file);
  });
  input.click();
}

function openImportModeSheet(text, data, ctx) {
  const sessionCount = Array.isArray(data.sessions) ? data.sessions.length : 0;
  const subjectCount = Array.isArray(data.subjects) ? data.subjects.length : 0;
  openSheet(`
    <h2 class="sheet-title">导入备份</h2>
    <p class="sheet-desc">文件里有 ${sessionCount} 条记录、${subjectCount} 个科目。选一种导入方式：</p>
    <div class="mez-pick">
      <button class="mez-pick-row" type="button" data-mode="merge">
        <span class="mez-pick-ic" aria-hidden="true">➕</span>
        <span class="mez-pick-main">
          <span class="mez-pick-title">合并到现有数据</span>
          <span class="mez-pick-sub">现有内容都保留，同名科目自动合并、重复记录跳过</span>
        </span>
        <span class="row-chev" aria-hidden="true">›</span>
      </button>
      <button class="mez-pick-row is-danger" type="button" data-mode="replace">
        <span class="mez-pick-ic" aria-hidden="true">🗑️</span>
        <span class="mez-pick-main">
          <span class="mez-pick-title">覆盖全部数据</span>
          <span class="mez-pick-sub">当前数据会被替换，替换前自动存一份快照</span>
        </span>
        <span class="row-chev" aria-hidden="true">›</span>
      </button>
    </div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="cancel">取消</button>
    </div>
  `, (sheet) => {
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-mode="merge"]').addEventListener('click', () => {
      try {
        const res = importJSON(text, { mode: 'merge' });
        closeSheet();
        haptic();
        toast(`已合并 ${res.addedSessions} 条记录、${res.addedSubjects} 个科目`);
        ctx.refresh();
      } catch (err) {
        console.error(err);
        toast('备份文件格式不对');
      }
    });
    sheet.querySelector('[data-mode="replace"]').addEventListener('click', () => {
      try {
        importJSON(text, { mode: 'replace' });
        haptic();
        toast('已导入，正在刷新');
        location.reload();
      } catch (err) {
        console.error(err);
        toast('备份文件格式不对');
      }
    });
  });
}

/* ---------- 备份：自动备份开关 / 快照列表 ---------- */
function backupStatusText() {
  const s = getState().settings;
  if (s.autoBackup === false) return '已关闭，数据仅存本机';
  return s.lastBackupDate ? ('上次备份 ' + s.lastBackupDate) : '开启中，今日将自动备份';
}

function backupCount() {
  return listBackups().length;
}

/* 快照时间：x月x日 HH:MM */
function snapshotWhen(b) {
  const d = new Date(b.backupAt || Date.now());
  return monthDayCN(d) + ' ' + hhmm(b.backupAt || Date.now());
}

function snapshotSessions(b) {
  const n = Number(b.sessions);
  if (Number.isFinite(n) && n >= 0) return n;
  return b.state && Array.isArray(b.state.sessions) ? b.state.sessions.length : 0;
}

function backupRestoreText() {
  const b = listBackups()[0];
  if (!b) return '暂无快照';
  return snapshotWhen(b) + ' · ' + snapshotSessions(b) + ' 条记录';
}

function backupListHTML() {
  const list = listBackups();
  const head = `<p class="mez-backup-count">共 ${list.length} 份，最多保留 7 份</p>`;
  if (!list.length) {
    return head + '<p class="mez-empty">暂无快照，先点「立即备份」</p>';
  }
  return head + '<div class="mez-backup-list">' + list.map((b) => {
    const name = b.name || '快照';
    const when = snapshotWhen(b);
    const count = snapshotSessions(b);
    return `
      <div class="mez-backup-row" role="group" aria-label="${esc(name)}，${esc(when)}，${count} 条记录">
        <div class="mez-backup-main">
          <div class="mez-backup-name">${esc(name)}</div>
          <div class="mez-backup-meta">${esc(when)} · ${count} 条记录</div>
        </div>
        <button class="mez-mini primary" type="button" data-restore="${esc(b.id)}"
          aria-label="恢复快照「${esc(name)}」，${esc(when)}，${count} 条记录">恢复</button>
        <button class="mez-mini danger" type="button" data-remove="${esc(b.id)}"
          aria-label="删除快照「${esc(name)}」，${esc(when)}，${count} 条记录">删除</button>
      </div>`;
  }).join('') + '</div>';
}

function openBackupsSheet(ctx) {
  openSheet(`
    <h2 class="sheet-title">备份快照</h2>
    <p class="sheet-desc">恢复到某一份，或删掉不再需要的快照。</p>
    <div id="mez-backup-list">${backupListHTML()}</div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="close">关闭</button>
      <button class="btn primary" type="button" data-act="backup-now">立即备份</button>
    </div>
  `, (sheet) => {
    const wrap = sheet.querySelector('#mez-backup-list');
    const redraw = () => { wrap.innerHTML = backupListHTML(); ctx.refresh(); };

    wrap.addEventListener('click', async (e) => {
      const restoreBtn = e.target.closest('[data-restore]');
      const removeBtn = e.target.closest('[data-remove]');
      if (restoreBtn) {
        const id = restoreBtn.dataset.restore;
        const item = listBackups().find((b) => b.id === id);
        if (!item) { redraw(); toast('这份快照已经不在了'); return; }
        const ok = await confirmSheet({
          title: '恢复这份快照？',
          desc: '将覆盖当前全部数据，恢复到「' + (item.name || '快照') + '」（' + snapshotWhen(item)
            + '，' + snapshotSessions(item) + ' 条记录）。恢复前会自动存一份当前数据的快照。',
          okText: '恢复', danger: true,
        });
        // 确认弹层会原地替换列表内容，取消时重新打开列表
        if (!ok) { openBackupsSheet(ctx); return; }
        try {
          restoreBackup(id);
          haptic();
          toast('已恢复');
          location.reload();
        } catch (err) {
          console.error(err);
          toast('恢复失败');
        }
        return;
      }
      if (removeBtn) {
        const id = removeBtn.dataset.remove;
        const item = listBackups().find((b) => b.id === id);
        if (!item) { redraw(); return; }
        const ok = await confirmSheet({
          title: '删除这份快照？',
          desc: '「' + (item.name || '快照') + '」（' + snapshotWhen(item) + '）会被删除，删除后不能再恢复。',
          okText: '删除', danger: true,
        });
        if (!ok) { openBackupsSheet(ctx); return; }
        removeBackup(id);
        haptic();
        toast('已删除快照');
        openBackupsSheet(ctx);
        ctx.refresh();
      }
    });

    sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="backup-now"]').addEventListener('click', () => openBackupNameSheet(ctx));
  });
}

/* 立即备份：起个名字（可留空，留空用默认名） */
function openBackupNameSheet(ctx) {
  openSheet(`
    <h2 class="sheet-title">立即备份</h2>
    <p class="sheet-desc">给这份快照起个名字，留空就按时间和来源自动命名。</p>
    <div class="field">
      <label for="mez-backup-name">快照名称（可选）</label>
      <input class="input" id="mez-backup-name" type="text" maxlength="20" placeholder="例如：期末复习前" />
    </div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="cancel">取消</button>
      <button class="btn primary" type="button" data-act="ok">保存快照</button>
    </div>
  `, (sheet) => {
    const input = sheet.querySelector('#mez-backup-name');
    const done = () => {
      const name = input.value.trim();
      const snapshot = saveBackupSnapshot('manual', name);
      haptic();
      if (!snapshot) { toast('备份失败，存储空间可能不足'); return; }
      closeSheet();
      toast('已保存快照「' + snapshot.name + '」');
      ctx.refresh();
    };
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="ok"]').addEventListener('click', done);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
    });
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (_) {} }, 150);
  });
}

function toggleAutoBackup(ctx) {
  const cur = getState().settings.autoBackup !== false;
  setSetting('autoBackup', !cur);
  haptic();
  toast(!cur ? '自动备份已开启' : '自动备份已关闭');
  ctx.refresh();
}
