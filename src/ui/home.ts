import { CONFIG } from '../config';
import { BANK } from '../core/bank';
import { streak, summarize } from '../core/progress';
import { html, mount, on } from './dom';
import type { View } from './view';

export const homeView: View = (root, app) => {
  const render = () => {
    const s = summarize(BANK, app.store.prog);
    const pct = Math.round((s.mastered / s.total) * 100);
    const days = streak(app.store.activity, Date.now());
    const last = app.store.attempts[app.store.attempts.length - 1];
    const wrongCount = BANK.filter((q) => (app.store.prog[q.n]?.wrong ?? 0) > 0).length;
    const guest = app.guestStore();
    const per = CONFIG.exam.pointsPerQuestion;

    mount(
      root,
      html`
        <h1 tabindex="-1">汽車駕照筆試練習</h1>

        ${guest
          ? html`<section class="card notice" aria-labelledby="merge-h">
              <h2 id="merge-h">這台裝置有登入前的練習進度</h2>
              <p>有 ${Object.keys(guest.prog).length} 題的進度是用訪客身分練的。要併入你的帳號嗎？同一題會保留較新的那一筆。</p>
              <div class="row">
                <button class="btn primary" data-act="merge">併入帳號</button>
                <button class="btn" data-act="discard">不要，清除訪客進度</button>
              </div>
            </section>`
          : ''}

        <section class="card hero" aria-label="目前進度">
          <div class="hero-main">
            <p class="eyebrow">已熟題數</p>
            <p class="big"><span data-testid="mastered">${s.mastered}</span><span class="of"> / ${s.total}</span></p>
            <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.mastered}" aria-label="已熟題數">
              <span style="width:${pct}%"></span>
            </div>
            <p class="muted small">連續答對 ${CONFIG.study.masteredAt} 次算已熟。目前完成 ${pct}%。</p>
          </div>
          <dl class="tiles">
            <div><dt>還不會</dt><dd data-testid="weak">${s.weak}</dd></div>
            <div><dt>做過</dt><dd>${s.seen}</dd></div>
            <div><dt>連續天數</dt><dd>${days}</dd></div>
          </dl>
        </section>

        <div class="grid2">
          <section class="card" aria-labelledby="study-h">
            <h2 id="study-h">背題</h2>
            <p class="muted">先作答再看答案。答錯的題很快會再出現，答對兩次就不再出現。</p>
            <div class="row">
              <a class="btn primary" href="#/study?go=1">${s.seen ? '繼續背題' : '開始背題'}</a>
              <a class="btn" href="#/study">選範圍</a>
              ${s.weak ? html`<a class="btn" href="#/study?scope=weak&go=1">只練還不會的（${s.weak}）</a>` : ''}
            </div>
          </section>

          <section class="card" aria-labelledby="exam-h">
            <h2 id="exam-h">模擬考</h2>
            <p class="muted">
              ${CONFIG.exam.questions} 題、${CONFIG.exam.seconds / 60} 分鐘、每題 ${per} 分，${CONFIG.exam.passScore} 分及格。交卷前不顯示對錯。
            </p>
            ${last
              ? html`<p class="small">上次：<strong class="${last.passed ? 'ok-text' : 'bad-text'}">${(last.total - last.wrong) * per} 分</strong>（錯 ${last.wrong} 題）</p>`
              : ''}
            <div class="row">
              <a class="btn primary" href="#/exam">開始模擬考</a>
              <a class="btn" href="#/stats">看歷史成績</a>
            </div>
          </section>

          <section class="card" aria-labelledby="wrong-h">
            <h2 id="wrong-h">錯題本</h2>
            <p class="muted">答錯過的題都收在這裡，附題庫題號，方便對照官方題庫。</p>
            <div class="row"><a class="btn" href="#/wrong">打開錯題本（${wrongCount}）</a></div>
          </section>

          ${!app.user && app.backend.available
            ? html`<section class="card" aria-labelledby="acct-h">
                <h2 id="acct-h">換裝置也能接著練</h2>
                <p class="muted">現在是訪客模式，進度只存在這台裝置。登入後會同步到雲端，手機和電腦共用同一份進度。</p>
                <div class="row"><a class="btn" href="#/account">註冊或登入</a></div>
              </section>`
            : ''}
        </div>

        <p class="muted small rule-note">
          題數、時間與及格分數是依一般公開說明設定，本站不是官方網站，實際規則以監理站公告為準。影片題（危險感知）請用監理服務網的官方模擬系統練習。
        </p>
      `,
    );
  };

  on(root, 'click', '[data-act="merge"]', (_e, btn) => {
    (btn as HTMLButtonElement).disabled = true;
    void app.mergeGuest();
  });
  on(root, 'click', '[data-act="discard"]', () => app.discardGuest());

  render();
  return { refresh: render };
};
