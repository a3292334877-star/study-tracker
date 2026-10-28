/* 安装引导：捕获 beforeinstallprompt，提供「添加到主屏幕」入口 */

let deferred = null;
let installed = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  window.dispatchEvent(new CustomEvent('installable'));
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferred = null;
});

/** 是否已作为独立 App 运行（主屏幕启动） */
export function isStandalone() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch (_) { /* 忽略 */ }
  return window.navigator.standalone === true;
}

/** 当前浏览器是否提供了原生安装弹窗 */
export function canInstall() {
  return !!deferred && !installed;
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ 伪装成 Mac
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent || '');
}

/** 触发原生安装弹窗。返回 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const evt = deferred;
  deferred = null;
  try {
    evt.prompt();
    const res = await evt.userChoice;
    return (res && res.outcome) || 'dismissed';
  } catch (_) {
    return 'unavailable';
  }
}

/** 分平台的手动安装说明 */
export function manualSteps() {
  if (isIOS()) {
    return {
      title: '添加到主屏幕',
      lead: '用 Safari 打开本页，按下面两步操作：',
      steps: ['点击底部工具栏的「分享」按钮（方框 + 向上箭头）', '在弹出菜单里选择「添加到主屏幕」，再点「添加」'],
      note: 'iOS 只有 Safari 支持添加到主屏幕，微信等内置浏览器需先「用浏览器打开」。',
    };
  }
  if (isAndroid()) {
    return {
      title: '添加到主屏幕',
      lead: '用 Chrome / Edge 打开本页，任选一种方式：',
      steps: ['点右上角「⋮」菜单，选择「安装应用」或「添加到主屏幕」', '或直接点地址栏右侧的安装图标'],
      note: '装好后从桌面图标启动，没有浏览器地址栏，和原生 App 一样。',
    };
  }
  return {
    title: '添加到主屏幕',
    lead: '在电脑上可以用 Chrome / Edge 安装：',
    steps: ['点击地址栏右侧的「安装」图标', '或在浏览器菜单中选择「应用 → 安装此站点」'],
    note: '手机安装体验更好：用手机浏览器打开同一地址即可。',
  };
}
