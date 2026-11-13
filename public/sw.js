/* 離線支援。策略刻意保持簡單：
 * - 換頁（HTML）：先走網路拿最新版，失敗才用快取，所以更新網站後使用者不會卡在舊版。
 * - 其他同源檔案（程式、樣式、題目附圖）：先回快取，同時在背景更新。
 * 不快取任何跨網域請求，所以登入與同步永遠直接走網路。
 * 改版時把 CACHE 的版本號加一，舊快取會在啟用時清掉。 */
const CACHE = 'dt-cache-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dt-cache-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true }).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary：有些伺服器會回 Vary: Origin，而 <script crossorigin> 的請求帶 Origin、
      // 預先放進快取的請求不帶，不忽略的話同一個檔案會比對不到。
      const hit = await cache.match(req, { ignoreVary: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || refresh;
    }),
  );
});
