import { App } from './app';
import { BANK, imageUrl } from './core/bank';
import { aboutView } from './ui/about';
import { accountView, syncLabel } from './ui/account';
import { $, html, mount } from './ui/dom';
import { examView } from './ui/exam';
import { homeView } from './ui/home';
import { statsView } from './ui/stats';
import { studyView } from './ui/study';
import type { View, ViewHandle } from './ui/view';
import { wrongView } from './ui/wrong';
import './style.css';

const ROUTES: Record<string, { view: View; title: string }> = {
  '/': { view: homeView, title: '首頁' },
  '/study': { view: studyView, title: '背題' },
  '/exam': { view: examView, title: '模擬考' },
  '/wrong': { view: wrongView, title: '錯題本' },
  '/stats': { view: statsView, title: '統計' },
  '/account': { view: accountView, title: '帳號' },
  '/about': { view: aboutView, title: '關於' },
};

const NAV: [string, string][] = [
  ['/', '首頁'],
  ['/study', '背題'],
  ['/exam', '模擬考'],
  ['/wrong', '錯題本'],
  ['/stats', '統計'],
];

const SITE = '汽車駕照筆試練習';

function parseHash(): { path: string; params: URLSearchParams } {
  const raw = location.hash.startsWith('#/') ? location.hash.slice(1) : '/';
  const [path, query = ''] = raw.split('?');
  return { path: ROUTES[path] ? path : '/', params: new URLSearchParams(query) };
}

async function boot() {
  const app = new App();
  const shell = document.getElementById('app')!;
  mount(
    shell,
    html`
      <a class="skip" href="#main">跳到主要內容</a>
      <header class="top">
        <a class="brand" href="#/"><span class="brand-mark" aria-hidden="true"></span>${SITE}</a>
        <a class="chip" href="#/account" data-el="chip" aria-label="帳號與同步狀態"></a>
      </header>
      <nav class="tabs" aria-label="主選單">
        ${NAV.map(([path, label]) => html`<a href="#${path}" data-path="${path}">${label}</a>`)}
      </nav>
      <main id="main"><p class="muted">載入中…</p></main>
      <footer class="foot">
        <p>
          題庫資料來源：交通部公路局《新版汽車筆試題庫》。本站為個人練習作品，非官方網站，內容以公路局與監理站公告為準。
          <a href="#/about">關於本站</a>　<a href="./privacy.html">隱私權政策</a>
        </p>
      </footer>
    `,
  );
  const main = $(shell, '#main')!;
  const chip = $(shell, '[data-el="chip"]')!;

  await app.init();

  let handle: ViewHandle | void;
  let currentPath = '';

  const updateChrome = () => {
    chip.textContent = syncLabel(app);
    const st = app.syncState();
    chip.dataset.state = !app.user ? 'guest' : (st?.status ?? 'idle');
    shell.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
      if (a.dataset.path === currentPath) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  };

  const route = () => {
    const { path, params } = parseHash();
    handle?.destroy?.();
    // 每次換頁用一個新的容器，舊頁面的事件監聽會跟著舊容器一起被回收。
    const view = document.createElement('div');
    view.className = 'view';
    main.replaceChildren(view);
    currentPath = path;
    document.title = path === '/' ? SITE : `${ROUTES[path].title}｜${SITE}`;
    handle = ROUTES[path].view(view, app, params);
    updateChrome();
    window.scrollTo({ top: 0 });
    // 把焦點移到新頁面的標題，讓鍵盤與讀屏器使用者知道換頁了。
    view.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };

  window.addEventListener('hashchange', route);
  app.onSync(updateChrome);
  app.onData(() => {
    updateChrome();
    handle?.refresh?.();
  });
  route();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => precacheImages(app))
        .catch(() => {
          /* 沒有 service worker 只是不能離線，其他功能不受影響 */
        });
    };
    // 啟動流程是非同步的，跑到這裡時 load 事件可能已經發生過了。
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

/** 第一次開啟後，在背景把題目附圖放進快取，之後離線也看得到圖。 */
async function precacheImages(app: App) {
  const FLAG = 'dt:img-cached:v1';
  if (app.kv.getItem(FLAG) || !('caches' in window)) return;
  const urls = BANK.map(imageUrl).filter((u): u is string => !!u);
  try {
    const cache = await caches.open('dt-cache-v1');
    // 第一次造訪時，程式與樣式是在 service worker 接手前下載的，這裡補進快取，
    // 這樣只開過一次也能離線使用。
    const loaded = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && /\.(js|css)(\?|$)/.test(u));
    await cache.addAll(loaded);
    for (let i = 0; i < urls.length; i += 24) await cache.addAll(urls.slice(i, i + 24));
    app.kv.setItem(FLAG, '1');
  } catch {
    /* 下次開啟再試 */
  }
}

void boot();
