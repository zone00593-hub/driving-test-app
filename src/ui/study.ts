import type { App } from '../app';
import { CONFIG } from '../config';
import { BANK } from '../core/bank';
import { isMastered, isWeak } from '../core/progress';
import { advanceQueue, buildPool, correctPosition, DEFAULT_FILTER, optionOrder, type Scope, type StudyFilter } from '../core/study';
import type { Choice, Prog, Question } from '../types';
import { $, html, mount, on, type Safe } from './dom';
import { categoryTag, optionLabel, questionBody } from './question';
import type { View } from './view';

interface Card {
  q: Question;
  order: [number, number, number];
  correct: Choice;
  /** 0 尚未作答；-1 按了「看答案」。 */
  chosen: Choice | 0 | -1;
  after: Prog | null;
}

interface Session {
  owner: string;
  filter: StudyFilter;
  queue: Question[];
  card: Card | null;
  answered: number;
  right: number;
}

// 放在模組層級：中途切到別頁再回來，可以接著背。
let session: Session | null = null;

const FILTER_KEY = 'dt:filter';
const SCOPES: Scope[] = ['all', 'c1', 'c2', 'c3', 'img', 'weak', 'wrongbook', 'new'];

function loadFilter(app: App): StudyFilter {
  try {
    const raw = app.kv.getItem(FILTER_KEY);
    return raw ? { ...DEFAULT_FILTER, ...(JSON.parse(raw) as Partial<StudyFilter>) } : { ...DEFAULT_FILTER };
  } catch {
    return { ...DEFAULT_FILTER };
  }
}

function scopeOptions(app: App): { value: Scope; label: string }[] {
  const prog = app.store.prog;
  const count = (f: (q: Question) => boolean) => BANK.filter(f).length;
  return [
    { value: 'all', label: `全部 ${BANK.length} 題` },
    { value: 'new', label: `還沒做過的（${count((q) => !prog[q.n]?.seen)}）` },
    { value: 'weak', label: `還不會的（${count((q) => isWeak(prog[q.n]))}）` },
    { value: 'wrongbook', label: `錯題本（${count((q) => (prog[q.n]?.wrong ?? 0) > 0)}）` },
    { value: 'img', label: `看圖題：標誌與標線（${count((q) => !!q.img)}）` },
    { value: 'c1', label: `架構一：正確觀念與態度（${count((q) => q.c === 1)}）` },
    { value: 'c2', label: `架構二：主動停讓文化（${count((q) => q.c === 2)}）` },
    { value: 'c3', label: `架構三：安全駕駛能力（${count((q) => q.c === 3)}）` },
  ];
}

export const studyView: View = (root, app, params) => {
  // 換了帳號就不沿用上一個人的進行中題目。
  if (session && session.owner !== app.store.owner) session = null;

  const start = (filter: StudyFilter) => {
    try {
      app.kv.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      /* 記不住篩選條件不影響使用 */
    }
    session = { owner: app.store.owner, filter, queue: buildPool(BANK, app.store.prog, filter, Math.random), card: null, answered: 0, right: 0 };
    render();
  };

  const nextCard = (s: Session): Card | null => {
    const q = s.queue[0];
    if (!q) return null;
    const order = optionOrder(q, s.filter.shuffleOptions, Math.random);
    return { q, order, correct: correctPosition(q, order), chosen: 0, after: null };
  };

  const pick = (choice: Choice | -1) => {
    const s = session;
    const card = s?.card;
    if (!s || !card || card.chosen !== 0) return;
    const correct = choice === card.correct;
    card.chosen = choice;
    card.after = app.answer(card.q.n, correct, 'study');
    s.answered++;
    if (correct) s.right++;
    render();
  };

  const next = () => {
    const s = session;
    if (!s?.card?.after) return;
    s.queue = advanceQueue(s.queue, s.card.after);
    s.card = null;
    render();
  };

  const renderSetup = () => {
    const f = loadFilter(app);
    const opts = scopeOptions(app);
    mount(
      root,
      html`
        <h1 tabindex="-1">背題</h1>
        <form class="card" data-form="setup">
          <div class="fields">
            <label class="field">
              <span>範圍</span>
              <select name="scope">
                ${opts.map((o) => html`<option value="${o.value}" ${o.value === f.scope ? html`selected` : ''}>${o.label}</option>`)}
              </select>
            </label>
            <label class="field">
              <span>順序</span>
              <select name="order">
                <option value="seq" ${f.order === 'seq' ? html`selected` : ''}>依題號</option>
                <option value="rnd" ${f.order === 'rnd' ? html`selected` : ''}>隨機</option>
              </select>
            </label>
          </div>
          <label class="check"><input type="checkbox" name="hideMastered" ${f.hideMastered ? html`checked` : ''} /> 不再出現已熟的題</label>
          <label class="check"><input type="checkbox" name="shuffleOptions" ${f.shuffleOptions ? html`checked` : ''} /> 打亂選項順序（練習記內容，不記第幾個）</label>
          <div class="row"><button class="btn primary" type="submit">開始</button></div>
          <p class="muted small">作答時可以用鍵盤：按 1、2、3 選答案，按 Enter 到下一題。</p>
        </form>
      `,
    );
  };

  const renderDone = (s: Session) => {
    mount(
      root,
      html`
        <h1 tabindex="-1">這一輪完成</h1>
        <section class="card">
          ${s.answered
            ? html`<p>這一輪作答 ${s.answered} 次，答對 ${s.right} 次。這個範圍裡沒有需要再背的題了。</p>`
            : html`<p>這個範圍裡目前沒有題目。可以換一個範圍，或取消「不再出現已熟的題」。</p>`}
          <div class="row">
            <button class="btn primary" data-act="setup">選其他範圍</button>
            <a class="btn" href="#/">回首頁</a>
          </div>
        </section>
      `,
    );
  };

  const renderCard = (s: Session, card: Card) => {
    const { q } = card;
    const revealed = card.chosen !== 0;
    const level = Math.min(app.store.prog[q.n]?.s ?? 0, CONFIG.study.masteredAt);
    const options: Safe[] = card.order.map((orig, i) => {
      const pos = (i + 1) as Choice;
      const state = !revealed ? '' : pos === card.correct ? 'ok' : pos === card.chosen ? 'bad' : '';
      return html`<button class="opt ${state}" data-pick="${pos}" ${revealed ? html`disabled` : ''}>
        ${optionLabel(q, orig, pos)}
        ${revealed && pos === card.correct ? html`<span class="mark">正解</span>` : ''}
        ${revealed && pos === card.chosen && pos !== card.correct ? html`<span class="mark">你選的</span>` : ''}
      </button>`;
    });
    const feedback = !revealed
      ? ''
      : card.chosen === card.correct
        ? html`<p class="feedback ok-text" role="status">答對了。${isMastered(card.after ?? undefined) ? '這題算已熟，不會再出現。' : '再答對一次就算已熟。'}</p>`
        : html`<p class="feedback bad-text" role="status">
            ${card.chosen === -1 ? '記為還不會。' : '答錯了。'}正確答案是 ${card.correct}。這題過幾題會再出現。
          </p>`;

    mount(
      root,
      html`
        <h1 class="sr-only" tabindex="-1">背題</h1>
        <div class="statusbar">
          <span>剩 <strong data-testid="remaining">${s.queue.length}</strong> 題　熟練度 ${level} / ${CONFIG.study.masteredAt}</span>
          <button class="btn small" data-act="end">結束</button>
        </div>
        <section class="card qcard" aria-label="題目">
          <p class="qmeta">${categoryTag(q)} <span class="mono">題庫 #${q.n}</span></p>
          ${questionBody(q)}
          <div class="opts ${q.full ? 'opts-row' : ''}" role="group" aria-label="選項">${options}</div>
          ${feedback}
        </section>
        <div class="row">
          ${revealed
            ? html`<button class="btn primary" data-act="next">下一題</button>`
            : html`<button class="btn" data-act="reveal">不知道，直接看答案</button>`}
        </div>
      `,
    );
    if (revealed) $(root, '[data-act="next"]')?.focus();
  };

  const render = () => {
    if (!session) return renderSetup();
    session.card ??= nextCard(session);
    if (!session.card) return renderDone(session);
    renderCard(session, session.card);
  };

  on(root, 'submit', '[data-form="setup"]', (e, form) => {
    e.preventDefault();
    const data = new FormData(form as HTMLFormElement);
    const scope = String(data.get('scope')) as Scope;
    start({
      scope: SCOPES.includes(scope) ? scope : 'all',
      order: data.get('order') === 'rnd' ? 'rnd' : 'seq',
      hideMastered: data.has('hideMastered'),
      shuffleOptions: data.has('shuffleOptions'),
    });
  });
  on(root, 'click', '[data-pick]', (_e, el) => pick(Number(el.dataset.pick) as Choice));
  on(root, 'click', '[data-act="reveal"]', () => pick(-1));
  on(root, 'click', '[data-act="next"]', next);
  on(root, 'click', '[data-act="end"]', () => {
    session = null;
    render();
  });
  on(root, 'click', '[data-act="setup"]', () => {
    session = null;
    render();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const card = session?.card;
    if (!card) return;
    if (card.chosen === 0 && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      pick(Number(e.key) as Choice);
    } else if (card.chosen !== 0 && (e.key === 'ArrowRight' || (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A'))) {
      e.preventDefault();
      next();
    }
  };
  document.addEventListener('keydown', onKey);

  // 從首頁或錯題本帶參數進來：?go=1 直接開始；另外帶 scope 的話，改用那個範圍重新開始。
  const scopeParam = params.get('scope') as Scope | null;
  const wantsScope = !!scopeParam && SCOPES.includes(scopeParam);
  if (params.get('go') === '1' && (wantsScope || !session)) {
    const f = loadFilter(app);
    // 錯題本要包含已克服的題，所以不略過已熟的。
    start(wantsScope ? { ...f, scope: scopeParam!, hideMastered: scopeParam === 'wrongbook' ? false : f.hideMastered } : f);
  } else {
    render();
  }

  return { destroy: () => document.removeEventListener('keydown', onKey) };
};
