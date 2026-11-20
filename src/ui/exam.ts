import type { App } from '../app';
import { CONFIG } from '../config';
import { BANK, questionByNo } from '../core/bank';
import { drawExam, formatClock, grade, type Grade } from '../core/exam';
import type { Attempt, Choice, Question } from '../types';
import { $, copyText, html, mount, on } from './dom';
import { categoryTag, optionLabel, questionAsText, questionBody, reviewOptions } from './question';
import type { View } from './view';

interface Running {
  owner: string;
  qnos: number[];
  answers: (Choice | 0)[];
  flags: boolean[];
  cur: number;
  startedAt: number;
  endsAt: number;
}

interface Result {
  questions: Question[];
  answers: (Choice | 0)[];
  grade: Grade;
  seconds: number;
  auto: boolean;
}

const KEY = 'dt:exam';
let result: Result | null = null;

function load(app: App): Running | null {
  try {
    const raw = app.tabKv.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Running;
    return r.owner === app.store.owner && Array.isArray(r.qnos) ? r : null;
  } catch {
    return null;
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // 舊瀏覽器的後備做法：仍是合法的 v4 格式。
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const examView: View = (root, app) => {
  let run = load(app);
  let confirming = false;
  let reviewAll = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const E = CONFIG.exam;

  const save = () => {
    try {
      if (run) app.tabKv.setItem(KEY, JSON.stringify(run));
      else app.tabKv.removeItem(KEY);
    } catch {
      /* 存不了只影響「重新整理後接續」，不影響作答 */
    }
  };

  const questions = (r: Running) => r.qnos.map((n) => questionByNo(n)!).filter(Boolean);

  const start = () => {
    const qs = drawExam(BANK, E.questions, Math.random);
    const now = Date.now();
    run = {
      owner: app.store.owner,
      qnos: qs.map((q) => q.n),
      answers: qs.map(() => 0),
      flags: qs.map(() => false),
      cur: 0,
      startedAt: now,
      endsAt: now + E.seconds * 1000,
    };
    result = null;
    confirming = false;
    save();
    render();
    tick();
  };

  const submit = (auto: boolean) => {
    if (!run) return;
    const qs = questions(run);
    const g = grade(qs, run.answers);
    const seconds = Math.min(E.seconds, Math.round((Date.now() - run.startedAt) / 1000));
    qs.forEach((q, i) => app.answer(q.n, run!.answers[i] === q.a, 'exam'));
    const attempt: Attempt = { id: uuid(), at: Date.now(), total: g.total, wrong: g.wrong, seconds, passed: g.passed, wrongQnos: g.wrongQnos };
    app.addAttempt(attempt);
    result = { questions: qs, answers: run.answers.slice(), grade: g, seconds, auto };
    run = null;
    confirming = false;
    reviewAll = false;
    save();
    stopTimer();
    render();
  };

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const tick = () => {
    stopTimer();
    timer = setInterval(() => {
      if (!run) return stopTimer();
      const left = Math.ceil((run.endsAt - Date.now()) / 1000);
      if (left <= 0) return submit(true);
      const el = $(root, '[data-testid="clock"]');
      if (el) {
        el.textContent = formatClock(left);
        el.classList.toggle('low', left <= 300);
      }
    }, 500);
  };

  const renderIntro = () => {
    mount(
      root,
      html`
        <h1 tabindex="-1">模擬考</h1>
        <section class="card">
          <dl class="tiles rules">
            <div><dt>題數</dt><dd>${E.questions}</dd></div>
            <div><dt>時間</dt><dd>${E.seconds / 60} 分</dd></div>
            <div><dt>及格</dt><dd>${E.passScore} 分</dd></div>
          </dl>
          <ul class="plain">
            <li>從全部 ${BANK.length} 題隨機抽題，包含看圖的標誌與標線題。每題 ${E.pointsPerQuestion} 分。</li>
            <li>交卷前不顯示對錯。時間到會自動交卷，沒作答的題算錯。</li>
            <li>可以把不確定的題「標記」起來，交卷前再回頭檢查。</li>
            <li>考試中重新整理頁面可以接續，關掉分頁就會放棄這次考試。</li>
          </ul>
          <div class="row"><button class="btn primary" data-act="start">開始作答</button></div>
          <p class="muted small">
            規則依一般公開說明設定，以監理站公告為準。正式考試另有危險感知影片題，本站沒有收錄，請用監理服務網的官方模擬系統練習。
          </p>
        </section>
      `,
    );
  };

  const renderRunning = (r: Running) => {
    const qs = questions(r);
    const q = qs[r.cur];
    const answered = r.answers.filter(Boolean).length;
    const flagged = r.flags.filter(Boolean).length;
    const left = Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000));
    mount(
      root,
      html`
        <h1 class="sr-only" tabindex="-1">模擬考作答中</h1>
        <div class="statusbar">
          <span>第 <strong>${r.cur + 1}</strong> / ${qs.length} 題　已答 <span data-testid="answered">${answered}</span></span>
          <span class="clock ${left <= 300 ? 'low' : ''}" role="timer" aria-label="剩餘時間" data-testid="clock">${formatClock(left)}</span>
        </div>

        <section class="card qcard" aria-label="第 ${r.cur + 1} 題">
          <p class="qmeta">${categoryTag(q)}</p>
          ${questionBody(q, `${r.cur + 1}．`)}
          <fieldset class="opts ${q.full ? 'opts-row' : ''}">
            <legend class="sr-only">選項</legend>
            ${([1, 2, 3] as const).map(
              (pos) => html`<label class="opt ${r.answers[r.cur] === pos ? 'sel' : ''}">
                <input type="radio" name="ans" value="${pos}" ${r.answers[r.cur] === pos ? html`checked` : ''} />
                ${optionLabel(q, pos - 1, pos)}
              </label>`,
            )}
          </fieldset>
        </section>

        <div class="row">
          <button class="btn" data-act="prev" ${r.cur === 0 ? html`disabled` : ''}>上一題</button>
          <button class="btn" data-act="next" ${r.cur === qs.length - 1 ? html`disabled` : ''}>下一題</button>
          <button class="btn" data-act="flag" aria-pressed="${r.flags[r.cur] ? 'true' : 'false'}">${r.flags[r.cur] ? '取消標記' : '標記待檢查'}</button>
          <button class="btn primary push-right" data-act="ask">交卷</button>
        </div>
        <p class="muted small kbd-hint">鍵盤：1、2、3 作答，← → 上一題／下一題，Enter 下一題。</p>

        ${confirming
          ? html`<section class="card confirm" role="alertdialog" aria-labelledby="confirm-h">
              <h2 id="confirm-h">確定交卷？</h2>
              <p>
                ${answered < qs.length ? html`還有 <strong>${qs.length - answered}</strong> 題沒作答，沒作答算錯。` : '全部作答完畢。'}
                ${flagged ? html`有 <strong>${flagged}</strong> 題標記待檢查。` : ''}交卷後不能再修改。
              </p>
              <div class="row">
                <button class="btn primary" data-act="submit">確定交卷</button>
                <button class="btn" data-act="cancel">繼續作答</button>
              </div>
            </section>`
          : ''}

        <section class="card" aria-labelledby="grid-h">
          <h2 id="grid-h" class="h3">題號</h2>
          <p class="muted small">底色表示已作答，角落的點表示標記待檢查。</p>
          <div class="qgrid">
            ${qs.map(
              (_q, i) => html`<button
                class="${r.answers[i] ? 'done' : ''} ${r.flags[i] ? 'flag' : ''} ${i === r.cur ? 'cur' : ''}"
                data-goto="${i}"
                aria-label="第 ${i + 1} 題${r.answers[i] ? '，已答' : '，未答'}${r.flags[i] ? '，已標記' : ''}"
                ${i === r.cur ? html`aria-current="true"` : ''}
              >
                ${i + 1}
              </button>`,
            )}
          </div>
        </section>
      `,
    );
    if (confirming) $(root, '[data-act="submit"]')?.focus();
  };

  const renderResult = (res: Result) => {
    const g = res.grade;
    const wrongIdx = res.questions.map((_q, i) => i).filter((i) => res.answers[i] !== res.questions[i].a);
    const list = reviewAll ? res.questions.map((_q, i) => i) : wrongIdx;
    const text =
      `汽車筆試模擬考 ${g.score} 分（${g.passed ? '及格' : '不及格'}），錯 ${g.wrong} 題\n\n` +
      wrongIdx.map((i) => questionAsText(res.questions[i], res.answers[i])).join('\n\n');
    mount(
      root,
      html`
        <h1 tabindex="-1">成績</h1>
        <section class="card result ${g.passed ? 'pass' : 'fail'}">
          <p class="score" data-testid="score">${g.score}<span class="of"> 分</span></p>
          <p><strong class="${g.passed ? 'ok-text' : 'bad-text'}" data-testid="verdict">${g.passed ? '及格' : '不及格'}</strong>（及格 ${E.passScore} 分）${res.auto ? '　時間到，已自動交卷。' : ''}</p>
          <dl class="tiles">
            <div><dt>答對</dt><dd>${g.right}</dd></div>
            <div><dt>答錯或未答</dt><dd>${g.wrong}</dd></div>
            <div><dt>用時</dt><dd>${formatClock(res.seconds)}</dd></div>
          </dl>
        </section>

        <div class="row">
          <button class="btn primary" data-act="start">再考一份</button>
          ${g.wrong ? html`<a class="btn" href="#/study?scope=weak&go=1">練習答錯的題</a>` : ''}
          <a class="btn" href="#/">回首頁</a>
        </div>

        <div class="row" role="group" aria-label="檢討範圍">
          <button class="btn small ${reviewAll ? '' : 'on'}" data-act="only-wrong" aria-pressed="${reviewAll ? 'false' : 'true'}">只看錯題（${g.wrong}）</button>
          <button class="btn small ${reviewAll ? 'on' : ''}" data-act="all" aria-pressed="${reviewAll ? 'true' : 'false'}">全部題目（${g.total}）</button>
        </div>

        ${list.length === 0 ? html`<section class="card"><p>全部答對。</p></section>` : ''}
        ${list.map((i) => {
          const q = res.questions[i];
          const ok = res.answers[i] === q.a;
          return html`<article class="card review ${ok ? 'right' : 'wrong'}">
            <p class="qmeta">
              <span class="mono">第 ${i + 1} 題・題庫 #${q.n}</span> ${categoryTag(q)}
              <span class="${ok ? 'ok-text' : 'bad-text'}">${ok ? '答對' : res.answers[i] ? '答錯' : '未作答'}</span>
            </p>
            ${questionBody(q)} ${reviewOptions(q, res.answers[i])}
          </article>`;
        })}

        ${g.wrong
          ? html`<section class="card">
              <h2 class="h3">錯題清單（純文字）</h2>
              <p class="muted small">可以複製後貼到筆記，或貼給 AI 請它逐題講解。</p>
              <textarea readonly rows="6" data-el="summary">${text}</textarea>
              <div class="row"><button class="btn" data-act="copy">複製</button><span class="muted small" role="status" data-el="copied"></span></div>
            </section>`
          : ''}
      `,
    );
  };

  const render = () => {
    if (run) return renderRunning(run);
    if (result) return renderResult(result);
    renderIntro();
  };

  const move = (to: number) => {
    if (!run) return;
    run.cur = Math.max(0, Math.min(run.qnos.length - 1, to));
    confirming = false;
    save();
    render();
    window.scrollTo({ top: 0 });
  };

  on(root, 'click', '[data-act="start"]', start);
  on(root, 'change', 'input[name="ans"]', (_e, input) => {
    if (!run) return;
    run.answers[run.cur] = Number((input as HTMLInputElement).value) as Choice;
    save();
    render();
    $<HTMLInputElement>(root, 'input[name="ans"]:checked')?.focus();
  });
  on(root, 'click', '[data-act="prev"]', () => move((run?.cur ?? 0) - 1));
  on(root, 'click', '[data-act="next"]', () => move((run?.cur ?? 0) + 1));
  on(root, 'click', '[data-goto]', (_e, el) => move(Number(el.dataset.goto)));
  on(root, 'click', '[data-act="flag"]', () => {
    if (!run) return;
    run.flags[run.cur] = !run.flags[run.cur];
    save();
    render();
  });
  on(root, 'click', '[data-act="ask"]', () => {
    confirming = true;
    render();
  });
  on(root, 'click', '[data-act="cancel"]', () => {
    confirming = false;
    render();
  });
  on(root, 'click', '[data-act="submit"]', () => submit(false));
  on(root, 'click', '[data-act="only-wrong"]', () => {
    reviewAll = false;
    render();
  });
  on(root, 'click', '[data-act="all"]', () => {
    reviewAll = true;
    render();
  });
  on(root, 'click', '[data-act="copy"]', async () => {
    const ta = $<HTMLTextAreaElement>(root, '[data-el="summary"]');
    const note = $(root, '[data-el="copied"]');
    if (!ta || !note) return;
    if (await copyText(ta.value)) note.textContent = '已複製。';
    else {
      ta.focus();
      ta.select();
      note.textContent = '已選取，請手動複製。';
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (!run || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return;
    // 選項是 radio：焦點在選項上時，瀏覽器預設會用方向鍵換答案。這裡攔下來改成換題。
    if (tag === 'INPUT' && (t as HTMLInputElement).type !== 'radio') return;
    if (['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      run.answers[run.cur] = Number(e.key) as Choice;
      save();
      render();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(run.cur + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(run.cur - 1);
    } else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
      e.preventDefault();
      move(run.cur + 1);
    }
  };
  document.addEventListener('keydown', onKey);

  if (run) {
    if (Date.now() >= run.endsAt) submit(true);
    else {
      render();
      tick();
    }
  } else render();

  return {
    destroy: () => {
      stopTimer();
      document.removeEventListener('keydown', onKey);
    },
  };
};
