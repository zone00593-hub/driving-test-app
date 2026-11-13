import type { App } from '../app';
import { $, formatDateTime, html, mount, on, type Safe } from './dom';
import type { View } from './view';

type Mode = 'signin' | 'signup' | 'forgot';

export function syncLabel(app: App): string {
  if (!app.user) return '訪客';
  const st = app.syncState();
  if (!st) return '已登入';
  if (st.status === 'syncing') return '同步中';
  if (st.status === 'offline') return st.pending ? `離線・${st.pending} 筆待上傳` : '離線';
  if (st.status === 'error') return '同步失敗';
  return st.pending ? `${st.pending} 筆待上傳` : '已同步';
}

export const accountView: View = (root, app) => {
  let mode: Mode = 'signin';
  let message: { kind: 'ok' | 'bad'; text: string } | null = null;
  let busy = false;
  let confirmDelete = false;
  let confirmSignOut = false;

  const note = (): Safe | '' => (message ? html`<p class="${message.kind === 'ok' ? 'ok-text' : 'bad-text'}" role="alert">${message.text}</p>` : '');

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    message = null;
    render();
    try {
      await job();
    } catch (e) {
      message = { kind: 'bad', text: (e as Error)?.message || '發生錯誤，請稍後再試。' };
    }
    busy = false;
    render();
  };

  const privacy = html`<section class="card" aria-labelledby="priv-h">
    <h2 id="priv-h" class="h3">這個網站存了什麼</h2>
    <ul class="plain">
      <li>訪客模式：進度只存在這台裝置的瀏覽器裡，不會傳到任何地方。</li>
      <li>登入後：雲端只存你的 Email、每題的練習進度、模擬考成績和每天的作答題數。資料庫設定成每個人只讀得到自己的資料。</li>
      <li>沒有廣告，沒有追蹤程式。你可以隨時在這一頁刪除帳號和雲端上的所有資料。</li>
      <li><a href="./privacy.html">完整的隱私權政策</a></li>
    </ul>
  </section>`;

  const renderUnavailable = () =>
    mount(
      root,
      html`
        <h1 tabindex="-1">帳號</h1>
        <section class="card">
          <p>這個網站目前沒有設定雲端後端，所以只有訪客模式：進度存在這台裝置的瀏覽器裡。</p>
          <p class="muted small">如果你是架站的人：照 README 建立 Supabase 專案並填入環境變數，就會出現註冊與登入。</p>
        </section>
        ${privacy}
      `,
    );

  const renderRecovery = () =>
    mount(
      root,
      html`
        <h1 tabindex="-1">設定新密碼</h1>
        <form class="card" data-form="newpw">
          <label class="field"><span>新密碼（至少 8 個字元）</span><input type="password" name="password" autocomplete="new-password" minlength="8" required /></label>
          ${note()}
          <div class="row"><button class="btn primary" type="submit" ${busy ? html`disabled` : ''}>儲存新密碼</button></div>
        </form>
      `,
    );

  const renderSignedOut = () =>
    mount(
      root,
      html`
        <h1 tabindex="-1">帳號</h1>
        <section class="card">
          <div class="row" role="group" aria-label="登入或註冊">
            <button class="btn small ${mode === 'signin' ? 'on' : ''}" data-mode="signin" aria-pressed="${mode === 'signin' ? 'true' : 'false'}">登入</button>
            <button class="btn small ${mode === 'signup' ? 'on' : ''}" data-mode="signup" aria-pressed="${mode === 'signup' ? 'true' : 'false'}">註冊</button>
          </div>
          ${mode !== 'forgot'
            ? html`<button class="btn google" type="button" data-act="google" ${busy ? html`disabled` : ''}>使用 Google 帳號繼續</button>
                <p class="divider"><span>或用 Email ${mode === 'signup' ? '註冊' : '登入'}</span></p>`
            : ''}
          <form data-form="auth" novalidate>
            <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" inputmode="email" required /></label>
            ${mode !== 'forgot'
              ? html`<label class="field">
                  <span>密碼${mode === 'signup' ? '（至少 8 個字元）' : ''}</span>
                  <input type="password" name="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" required />
                </label>`
              : html`<p class="muted small">輸入註冊時的 Email，我們會寄一封重設密碼的信給你。</p>`}
            ${note()}
            <div class="row">
              <button class="btn primary" type="submit" ${busy ? html`disabled` : ''}>
                ${busy ? '處理中…' : mode === 'signin' ? '登入' : mode === 'signup' ? '建立帳號' : '寄出重設信'}
              </button>
              ${mode === 'signin' ? html`<button class="btn link" type="button" data-mode="forgot">忘記密碼</button>` : ''}
              ${mode === 'forgot' ? html`<button class="btn link" type="button" data-mode="signin">回到登入</button>` : ''}
            </div>
          </form>
          <p class="muted small">不登入也可以完整使用。登入的好處是進度會同步到雲端，換裝置可以接著練。第一次用 Google 登入會自動建立帳號。</p>
        </section>
        ${privacy}
      `,
    );

  const renderSignedIn = () => {
    const st = app.syncState();
    mount(
      root,
      html`
        <h1 tabindex="-1">帳號</h1>
        <section class="card">
          <p>已登入：<strong data-testid="email">${app.user!.email}</strong></p>
          <p>
            同步狀態：<span data-testid="sync-status">${syncLabel(app)}</span>
            ${st?.lastSyncAt ? html`<span class="muted small">（上次同步 ${formatDateTime(st.lastSyncAt)}）</span>` : ''}
          </p>
          ${st?.status === 'error' && st.error ? html`<p class="bad-text small">${st.error}</p>` : ''}
          ${st?.status === 'offline' ? html`<p class="muted small">現在沒有網路。作答會先存在這台裝置，恢復連線後自動上傳。</p>` : ''}
          ${note()}
          <div class="row">
            <button class="btn" data-act="sync" ${busy ? html`disabled` : ''}>立即同步</button>
            <button class="btn" data-act="signout" ${busy ? html`disabled` : ''}>登出</button>
          </div>
          ${confirmSignOut
            ? html`<div class="confirm" role="alertdialog" aria-labelledby="so-h">
                <h2 id="so-h" class="h3">還有進度沒上傳</h2>
                <p>有 ${st?.pending ?? 0} 筆資料還沒送到雲端（可能是沒有網路）。現在登出，這些進度會遺失。</p>
                <div class="row">
                  <button class="btn" data-act="signout-cancel">先不登出</button>
                  <button class="btn danger" data-act="signout-force">仍要登出</button>
                </div>
              </div>`
            : ''}
        </section>

        <section class="card" aria-labelledby="del-h">
          <h2 id="del-h" class="h3">刪除帳號</h2>
          <p class="muted">會刪除你的帳號，以及雲端上的所有練習進度與成績，無法復原。</p>
          ${confirmDelete
            ? html`<form data-form="delete" class="confirm">
                <label class="field"><span>請輸入你的 Email 確認刪除</span><input type="email" name="email" autocomplete="off" required /></label>
                <div class="row">
                  <button class="btn" type="button" data-act="delete-cancel">取消</button>
                  <button class="btn danger" type="submit" ${busy ? html`disabled` : ''}>永久刪除帳號</button>
                </div>
              </form>`
            : html`<div class="row"><button class="btn danger" data-act="delete-ask">刪除帳號與所有資料</button></div>`}
        </section>
        ${privacy}
      `,
    );
  };

  const render = () => {
    if (!app.backend.available) return renderUnavailable();
    if (app.recovering) return renderRecovery();
    if (app.user) return renderSignedIn();
    renderSignedOut();
  };

  on(root, 'click', '[data-mode]', (_e, el) => {
    mode = el.dataset.mode as Mode;
    message = null;
    render();
    $<HTMLInputElement>(root, 'input[name="email"]')?.focus();
  });

  on(root, 'submit', '[data-form="auth"]', (e, form) => {
    e.preventDefault();
    const data = new FormData(form as HTMLFormElement);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      message = { kind: 'bad', text: '請輸入正確的 Email。' };
      return render();
    }
    if (mode !== 'forgot' && password.length < 8) {
      message = { kind: 'bad', text: '密碼至少要 8 個字元。' };
      return render();
    }
    void run(async () => {
      if (mode === 'signin') await app.backend.signIn(email, password);
      else if (mode === 'signup') {
        const r = await app.backend.signUp(email, password);
        if (r.needsEmailConfirm) {
          mode = 'signin';
          message = { kind: 'ok', text: '帳號已建立。請到信箱點驗證連結，再回來登入。' };
        }
      } else {
        await app.backend.sendPasswordReset(email);
        mode = 'signin';
        message = { kind: 'ok', text: '如果這個 Email 有註冊，重設密碼的信已經寄出。' };
      }
    });
  });

  on(root, 'click', '[data-act="google"]', () =>
    void run(async () => {
      await app.backend.signInWithGoogle();
    }),
  );

  on(root, 'submit', '[data-form="newpw"]', (e, form) => {
    e.preventDefault();
    const password = String(new FormData(form as HTMLFormElement).get('password') ?? '');
    if (password.length < 8) {
      message = { kind: 'bad', text: '密碼至少要 8 個字元。' };
      return render();
    }
    void run(async () => {
      await app.backend.updatePassword(password);
      app.recovering = false;
      message = { kind: 'ok', text: '密碼已更新。' };
    });
  });

  on(root, 'click', '[data-act="sync"]', () => void run(() => app.fullSync()));
  on(root, 'click', '[data-act="signout"]', () =>
    void run(async () => {
      const done = await app.signOut();
      confirmSignOut = !done;
      if (done) mode = 'signin'; // 登出後回到登入表單，而不是停在上次的註冊表單
    }),
  );
  on(root, 'click', '[data-act="signout-cancel"]', () => {
    confirmSignOut = false;
    render();
  });
  on(root, 'click', '[data-act="signout-force"]', () =>
    void run(async () => {
      confirmSignOut = false;
      await app.signOut(true);
      mode = 'signin';
    }),
  );
  on(root, 'click', '[data-act="delete-ask"]', () => {
    confirmDelete = true;
    render();
    $<HTMLInputElement>(root, '[data-form="delete"] input')?.focus();
  });
  on(root, 'click', '[data-act="delete-cancel"]', () => {
    confirmDelete = false;
    render();
  });
  on(root, 'submit', '[data-form="delete"]', (e, form) => {
    e.preventDefault();
    const typed = String(new FormData(form as HTMLFormElement).get('email') ?? '').trim().toLowerCase();
    if (typed !== app.user?.email.toLowerCase()) {
      message = { kind: 'bad', text: '輸入的 Email 和帳號不一致，沒有刪除。' };
      return render();
    }
    void run(async () => {
      await app.deleteAccount();
      confirmDelete = false;
      message = { kind: 'ok', text: '帳號與雲端資料已刪除。' };
    });
  });

  render();
  // 同步狀態改變時只在沒有輸入框的畫面重畫，避免打字打到一半被清掉。
  const off = app.onSync(() => {
    if (app.user && !confirmDelete && !busy) render();
  });
  return {
    destroy: () => off(),
    refresh: () => {
      if (!busy) render();
    },
  };
};
