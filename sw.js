/* 离线缓存：页面走网络优先，静态资源走缓存优先 + 后台更新
   注意：ASSETS 必须覆盖 js/ 下全部模块与 css/ 全部分片，
   改完请跑 node _tools/test6.mjs —— 它会扫描静态 import 与本清单对比。 */
const CACHE = 'study-tracker-v14';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './css/parts/log.css',
  './css/parts/stats.css',
  './css/parts/sheets.css',
  './css/parts/me.css',
  './js/app.js',
  './js/util.js',
  './js/store.js',
  './js/csv.js',
  './js/timer.js',
  './js/sheets.js',
  './js/report.js',
  './js/install.js',
  './js/views/home.js',
  './js/views/log.js',
  './js/views/subjects.js',
  './js/views/timer.js',
  './js/views/stats.js',
  './js/views/me.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((url) => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面导航：先网络，失败再用缓存（保证能拿到最新版本）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：缓存优先 + 后台静默更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
