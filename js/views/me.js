/* 我的 / 设置 */
import {
  getState, setSetting, exportJSON, importJSON, resetAll,
  listBackups, saveBackupSnapshot, removeBackup, restoreBackup,
  clearDemo, hasDemoData, listCorrupt, clearCorrupt, estimateStorageBytes,
  tagStats, renameTag, removeTag, importSessions,
  auditData, dedupeSessions, reassignOrphanSessions, fixAbnormalMinutes,
  achievementStats, planWeek,
} from '../store.js';
import {
  applyTheme, openSheet, closeSheet, toast, fmtMinShort, dateKey,
  confirmSheet, esc, haptic, hhmm, monthDayCN,
} from '../util.js';
import { isStandalone, canInstall, promptInstall, manualSteps } from '../install.js';
import { requestNotifyPermission } from '../timer.js';
import { csvToRecords } from '../csv.js';

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function renderMe(ctx) {
  const state = getState();
  const totalMin = state.sessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalDays = new Set(state.sessions.map((s) => dateKey(new Date(s.end)))).size;
  const subjectCount = state.subjects.length;
  const auditInfo = auditData();
  const achieve = achievementStats();
  const weekPlan = planWeek(dateKey(new Date()));

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
      ${(window.AndroidApp && typeof window.AndroidApp.getDailyReminder === 'function') ? `
      <button class="row" type="button" data-act="daily-reminder">
        <div class="row-ic">⏰</div>
        <div class="row-main"><div class="row-title">每日提醒</div><div class="row-sub">每天固定时间提醒你记一笔</div></div>
        <div class="row-val" id="daily-reminder-val">${esc(dailyReminderText())}</div>
      </button>` : ''}
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
      <button class="row" type="button" data-act="tag-manage">
        <div class="row-ic">🏷️</div>
        <div class="row-main"><div class="row-title">标签管理</div><div class="row-sub">${tagStats().length} 个标签 · 重命名 / 合并 / 删除</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="memory">
        <div class="row-ic">🔁</div>
        <div class="row-main"><div class="row-title">笔记回顾</div><div class="row-sub">按间隔重温写过心得的记录</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="plan">
        <div class="row-ic">🗓️</div>
        <div class="row-main"><div class="row-title">学习计划</div><div class="row-sub">本周 ${weekPlan.total} 项任务 · 按天安排</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="achievements">
        <div class="row-ic">🏅</div>
        <div class="row-main"><div class="row-title">成就徽章</div><div class="row-sub">已点亮 ${achieve.unlocked} / ${achieve.total} 枚</div></div>
        <div class="row-val">${achieve.unlocked}/${achieve.total}</div>
        <div class="row-chev">›</div>
      </button>
    </section>

    <div class="section-label">数据</div>
    <section class="card flat fade-in">
      <div class="row" id="storage-usage-row">
        <div class="row-ic">📊</div>
        <div class="row-main"><div class="row-title">存储用量</div><div class="row-sub" id="storage-usage-sub">本项目数据占用 ${fmtBytes(estimateStorageBytes())}</div></div>
        <div class="row-val" id="storage-usage-val"></div>
      </div>
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
      <button class="row" type="button" data-act="import-csv">
        <div class="row-ic">📄</div>
        <div class="row-main"><div class="row-title">导入 CSV</div><div class="row-sub">从表格批量补记录，科目按名字自动对上</div></div>
        <div class="row-chev">›</div>
      </button>
      <button class="row" type="button" data-act="audit">
        <div class="row-ic">🩺</div>
        <div class="row-main"><div class="row-title">数据体检</div><div class="row-sub" id="audit-sub">${auditSummary(auditInfo)}</div></div>
        ${auditInfo.total ? `<div class="row-val" style="color:var(--warn)">${auditInfo.total} 处</div>` : '<div class="row-chev">›</div>'}
      </button>
      ${hasDemoData() ? `<button class="row" type="button" data-act="clear-demo">
        <div class="row-ic">🧪</div>
        <div class="row-main"><div class="row-title">移除示例数据</div><div class="row-sub">只删第一次打开时的示例内容，自己的都保留</div></div>
        <div class="row-chev">›</div>
      </button>` : ''}
      ${listCorrupt().length ? `<button class="row" type="button" data-act="clear-corrupt">
        <div class="row-ic">🩹</div>
        <div class="row-main"><div class="row-title">清除损坏留档</div><div class="row-sub">数据修复时的原始留底，最多自动保留 3 份</div></div>
        <div class="row-val">${listCorrupt().length} 份</div>
      </button>` : ''}
      <button class="row" type="button" data-act="reset">
        <div class="row-ic">🧹</div>
        <div class="row-main"><div class="row-title" style="color:var(--danger)">清空所有数据</div><div class="row-sub">不可恢复，清空之前会自动存一份快照</div></div>
        <div class="row-chev">›</div>
      </button>
    </section>

    <p class="hint center" style="margin-top:22px;line-height:1.9">
      数据仅保存在本机${window.AndroidApp ? ' App' : '浏览器'}<br/>
      学习记录 v1.21 · ${window.AndroidApp ? 'Android 应用' : '可以添加到主屏幕使用'}
    </p>
  `;

  function mount(root) {
    root.querySelectorAll('[data-set]').forEach((row) => {
      row.addEventListener('click', () => openSetting(row.dataset.set, ctx));
    });
    const installRow = root.querySelector('[data-act="install"]');
    if (installRow) installRow.addEventListener('click', openInstallSheet);
    root.querySelector('[data-act="notify"]').addEventListener('click', () => askNotify(ctx));
    const drRow = root.querySelector('[data-act="daily-reminder"]');
    if (drRow) drRow.addEventListener('click', () => openDailyReminderSheet(ctx));
    root.querySelector('[data-act="subjects"]').addEventListener('click', () => ctx.go('#/subjects'));
    root.querySelector('[data-act="timer"]').addEventListener('click', () => ctx.go('#/timer'));
    root.querySelector('[data-act="memory"]').addEventListener('click', () => ctx.go('#/memory'));
    const planRow = root.querySelector('[data-act="plan"]');
    if (planRow) planRow.addEventListener('click', () => ctx.go('#/plan'));
    const achRow = root.querySelector('[data-act="achievements"]');
    if (achRow) achRow.addEventListener('click', () => ctx.go('#/achievements'));
    const tagRow = root.querySelector('[data-act="tag-manage"]');
    if (tagRow) tagRow.addEventListener('click', () => openTagSheet(ctx));
    const abRow = root.querySelector('[data-act="autobackup"]');
    if (abRow) abRow.addEventListener('click', () => toggleAutoBackup(ctx));
    const bnRow = root.querySelector('[data-act="backup-now"]');
    if (bnRow) bnRow.addEventListener('click', () => openBackupNameSheet(ctx));
    const bkRow = root.querySelector('[data-act="backups"]');
    if (bkRow) bkRow.addEventListener('click', () => openBackupsSheet(ctx));
    root.querySelector('[data-act="export"]').addEventListener('click', doExport);
    const ccRow = root.querySelector('[data-act="clear-corrupt"]');
    if (ccRow) ccRow.addEventListener('click', async () => {
      const n = listCorrupt().length;
      const ok = await confirmSheet({
        title: '清除损坏留档？',
        desc: '共 ' + n + ' 份解析失败时的原始数据留底，清除后不可恢复。正常使用不受影响。',
        okText: '清除', danger: true,
      });
      if (!ok) return;
      const removed = clearCorrupt();
      haptic();
      toast('已清除 ' + removed + ' 份留档');
      ctx.refresh();
    });
    // v1.7：浏览器配额是异步的，估算出百分比后再回填；80% 预警 / 95% 危险
    const usageVal = root.querySelector('#storage-usage-val');
    const usageSub = root.querySelector('#storage-usage-sub');
    if (usageVal && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (!usageVal.isConnected || !est || !est.quota) return;
        const pct = Math.round((est.usage || 0) / est.quota * 100);
        usageVal.textContent = '全站 ' + pct + '%';
        if (pct >= 95) {
          usageVal.style.color = 'var(--danger)';
          usageSub.textContent = '存储即将写满，建议先导出一份备份';
        } else if (pct >= 80) {
          usageVal.style.color = 'var(--warn)';
          usageSub.textContent = '存储占用偏高，建议先导出一份备份';
        }
      }).catch(() => {});
    }
    root.querySelector('[data-act="import"]').addEventListener('click', () => doImport(ctx));
    root.querySelector('[data-act="import-csv"]').addEventListener('click', () => doImportCSV(ctx));
    root.querySelector('[data-act="audit"]').addEventListener('click', () => openAuditSheet(ctx));
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

/* ---------- v1.8：每日提醒（仅 Android 壳，Java 侧闹钟为唯一事实来源） ---------- */
function reminderBridge() {
  const a = typeof window !== 'undefined' ? window.AndroidApp : null;
  return a && typeof a.getDailyReminder === 'function' && typeof a.setDailyReminder === 'function' ? a : null;
}

function dailyReminderText() {
  const bridge = reminderBridge();
  if (!bridge) return '关';
  try {
    const t = String(bridge.getDailyReminder() || '');
    return /^\d{1,2}:\d{2}$/.test(t) ? t : '关';
  } catch (_) { return '关'; }
}

const REMINDER_PRESETS = ['08:00', '12:00', '18:00', '20:00', '21:00', '22:00'];

function openDailyReminderSheet(ctx) {
  const bridge = reminderBridge();
  if (!bridge) return;
  let cur = '';
  try { cur = String(bridge.getDailyReminder() || ''); } catch (_) { cur = ''; }
  if (!/^\d{1,2}:\d{2}$/.test(cur)) cur = '';
  openSheet(`
    <h2 class="sheet-title">每日提醒</h2>
    <p class="sheet-desc">每天在这个时间提醒你记一笔。重启手机也会照常提醒，不需要打开应用。</p>
    <div class="chips" id="reminder-wrap">
      ${REMINDER_PRESETS.map((t) => `<button class="chip${t === cur ? ' on' : ''}" type="button" data-time="${t}">${t}</button>`).join('')}
    </div>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="off">关闭提醒</button>
      <button class="btn primary" type="button" data-act="ok">保存</button>
    </div>
  `, (sheet) => {
    let picked = cur;
    sheet.querySelectorAll('[data-time]').forEach((b) => {
      b.addEventListener('click', () => {
        picked = b.dataset.time;
        sheet.querySelectorAll('[data-time]').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
    sheet.querySelector('[data-act="off"]').addEventListener('click', () => {
      try {
        bridge.setDailyReminder(picked || '20:00', false);
        haptic();
        toast('已关闭每日提醒');
        closeSheet();
        ctx.refresh();
      } catch (_) { toast('设置失败'); }
    });
    sheet.querySelector('[data-act="ok"]').addEventListener('click', () => {
      if (!picked) { toast('先选一个时间'); return; }
      try {
        const ok = bridge.setDailyReminder(picked, true);
        if (ok === false) { toast('设置失败'); return; }
        haptic();
        toast('已开启每日提醒 · ' + picked);
        closeSheet();
        ctx.refresh();
      } catch (_) { toast('设置失败'); }
    });
  });
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

/* ---------- 导入 CSV（v1.11） ---------- */
function doImportCSV(ctx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let parsed = null;
      try { parsed = csvToRecords(text); } catch (err) { console.error(err); toast('CSV 解析失败'); return; }
      if (!parsed.records.length) {
        toast(parsed.skipped.length ? '没有可导入的记录（' + parsed.skipped.length + ' 行被跳过）' : 'CSV 里没有记录');
        return;
      }
      openCsvImportSheet(parsed, ctx);
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file);
  });
  input.click();
}

function openCsvImportSheet(parsed, ctx) {
  const { records, skipped } = parsed;
  const reasonCount = {};
  skipped.forEach((s) => { reasonCount[s.reason] = (reasonCount[s.reason] || 0) + 1; });
  const reasonText = Object.keys(reasonCount).map((k) => k + ' ' + reasonCount[k] + ' 行').join('、');
  const totalMin = records.reduce((n, r) => n + r.minutes, 0);
  const subjectNames = [...new Set(records.map((r) => r.subjectName).filter(Boolean))];
  openSheet(`
    <h2 class="sheet-title">导入 CSV</h2>
    <p class="sheet-desc">可导入 <b>${records.length}</b> 条，合计 ${fmtMinShort(totalMin)}${skipped.length ? '；跳过 ' + skipped.length + ' 行（' + esc(reasonText) + '）' : ''}。</p>
    <p class="sheet-desc">涉及 ${subjectNames.length} 个科目，名字对不上的会自动新建；重复记录（科目 + 标题 + 开始时间 + 时长都相同）会跳过。</p>
    <div class="sheet-actions">
      <button class="btn" type="button" data-act="no">取消</button>
      <button class="btn primary" type="button" data-act="yes">导入</button>
    </div>
  `, (sheet) => {
    sheet.querySelector('[data-act="no"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-act="yes"]').addEventListener('click', () => {
      try {
        const res = importSessions(records);
        closeSheet();
        haptic();
        const bits = ['已导入 ' + res.added + ' 条'];
        if (res.duplicates) bits.push('跳过重复 ' + res.duplicates + ' 条');
        if (res.createdSubjects) bits.push('新建科目 ' + res.createdSubjects + ' 个');
        toast(bits.join('，'));
        ctx.refresh();
      } catch (err) {
        console.error(err);
        toast('导入失败');
      }
    });
  });
}

/* ---------- 数据体检（v1.12） ---------- */
function auditSummary(a) {
  if (!a.total) return '一切正常，没有发现可疑记录';
  return '发现 ' + a.total + ' 处可疑数据，点此查看';
}

function openAuditSheet(ctx) {
  const a = auditData();
  const rows = [];
  if (a.duplicateCount) {
    rows.push('<button class="row" type="button" data-fix="dup">'
      + '<div class="row-ic">🧬</div>'
      + '<div class="row-main"><div class="row-title">重复记录</div><div class="row-sub">'
      + a.duplicates.length + ' 组，可清理 ' + a.duplicateCount + ' 条（保留最早一条）</div></div>'
      + '<div class="row-chev">›</div></button>');
  }
  if (a.orphan.length) {
    rows.push('<button class="row" type="button" data-fix="orphan">'
      + '<div class="row-ic">🪢</div>'
      + '<div class="row-main"><div class="row-title">孤儿记录</div><div class="row-sub">'
      + a.orphan.length + ' 条记录的科目已不存在</div></div>'
      + '<div class="row-chev">›</div></button>');
  }
  if (a.abnormal.length) {
    rows.push('<button class="row" type="button" data-fix="abnormal">'
      + '<div class="row-ic">⏳</div>'
      + '<div class="row-main"><div class="row-title">异常时长</div><div class="row-sub">'
      + a.abnormal.length + ' 条记录的时长不在 0–24 小时之间</div></div>'
      + '<div class="row-chev">›</div></button>');
  }
  const desc = a.total
    ? '发现 <b>' + a.total + '</b> 处可疑数据。修复前会自动存一份「体检修复前保护」快照，弄错了可以在「备份快照」里找回。'
    : '全部正常：没有重复记录、没有孤儿记录，时长也都在合理范围内。';
  openSheet('<h2 class="sheet-title">数据体检</h2>'
    + '<p class="sheet-desc">' + desc + '</p>'
    + (rows.length ? '<div class="card flat">' + rows.join('') + '</div>' : '')
    + '<div class="sheet-actions"><button class="btn" type="button" data-act="close">关闭</button></div>', (sheet) => {
    sheet.querySelector('[data-act="close"]').addEventListener('click', closeSheet);
    const dup = sheet.querySelector('[data-fix="dup"]');
    if (dup) dup.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '合并重复记录？', desc: '将保留每组时间最早的一条，删除另外 ' + a.duplicateCount + ' 条；被删记录的备注与标签会合并到保留的那条上。', okText: '合并', danger: true });
      if (!ok) return;
      const res = dedupeSessions();
      haptic(); toast('已合并 ' + res.groups + ' 组，清理 ' + res.removed + ' 条');
      ctx.refresh();
    });
    const orp = sheet.querySelector('[data-fix="orphan"]');
    if (orp) orp.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '归入「未分类」？', desc: a.orphan.length + ' 条记录的科目已经不存在，会新建「未分类」科目并把它们归过去。', okText: '归入', danger: false });
      if (!ok) return;
      const res = reassignOrphanSessions();
      haptic(); toast('已归入「未分类」：' + res.moved + ' 条');
      ctx.refresh();
    });
    const abn = sheet.querySelector('[data-fix="abnormal"]');
    if (abn) abn.addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '修正异常时长？', desc: a.abnormal.length + ' 条记录的时长不在 0–24 小时之间：负值按 0 分钟、超过 24 小时的按 24 小时计算，开始时间同步调整。', okText: '修正', danger: false });
      if (!ok) return;
      const n = fixAbnormalMinutes();
      haptic(); toast('已修正 ' + n + ' 条时长');
      ctx.refresh();
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

/* ---------- v1.10：标签管理（重命名 / 合并 / 删除） ---------- */
function openTagSheet(ctx) {
  const rows = tagStats();
  if (!rows.length) { toast('还没有标签，记一笔时就能加'); return; }
  const list = rows.map((r) => `<button class="row" type="button" data-tag="${esc(r.tag)}">
        <div class="row-main"><div class="row-title">#${esc(r.tag)}</div>
          <div class="row-sub">${r.count} 条记录${r.minutes ? ' · ' + fmtMinShort(r.minutes) : ''}</div></div>
        <div class="row-chev">›</div>
      </button>`).join('');
  openSheet(`
    <h2 class="sheet-title">标签管理</h2>
    <p class="sheet-desc">共 ${rows.length} 个标签 · 点一个可以重命名、合并或删除</p>
    <div class="list">${list}</div>
  `, (sheet) => {
    sheet.querySelectorAll('[data-tag]').forEach((btn) => {
      btn.addEventListener('click', () => openTagActions(btn.dataset.tag, ctx));
    });
  });
}

function openTagActions(tag, ctx) {
  const row = tagStats().find((r) => r.tag === tag);
  const count = row ? row.count : 0;
  openSheet(`
    <h2 class="sheet-title">#${esc(tag)}</h2>
    <p class="sheet-desc">出现在 ${count} 条记录里</p>
    <div class="sheet-actions" style="flex-direction:column;gap:10px">
      <button class="btn" type="button" data-do="rename">重命名 / 合并到其他标签</button>
      <button class="btn" type="button" data-do="del" style="color:var(--danger)">删除这个标签</button>
      <button class="btn" type="button" data-do="cancel">取消</button>
    </div>
  `, (sheet) => {
    sheet.querySelector('[data-do="cancel"]').addEventListener('click', closeSheet);
    sheet.querySelector('[data-do="rename"]').addEventListener('click', async () => {
      const next = await promptSheet({
        title: '重命名标签',
        desc: '改成已有标签会自动合并；记录数不会丢。',
        value: tag, placeholder: '新标签名', maxlength: 12, okText: '保存',
      });
      if (next == null) return;
      const to = String(next).trim().replace(/^#/, '');
      if (!to || to === tag) { toast('标签名没有变化'); return; }
      const n = renameTag(tag, to);
      haptic();
      if (n) { closeSheet(); toast('已把 ' + n + ' 条记录的 #' + tag + ' 改为 #' + to); ctx.refresh(); }
      else { toast('没有需要改动的记录'); }
    });
    sheet.querySelector('[data-do="del"]').addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: '删除标签 #' + tag + '？',
        desc: '会把它从 ' + count + ' 条记录上移除，记录本身和其他内容不受影响。',
        okText: '删除', danger: true,
      });
      if (!ok) return;
      const n = removeTag(tag);
      haptic();
      closeSheet();
      toast(n ? '已从 ' + n + ' 条记录移除 #' + tag : '标签已不存在');
      ctx.refresh();
    });
  });
}

