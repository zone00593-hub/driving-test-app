import { BANK } from '../core/bank';
import { isMastered } from '../core/progress';
import { $, copyText, html, mount, on } from './dom';
import { categoryTag, questionAsText, questionBody, reviewOptions } from './question';
import type { View } from './view';

const PAGE = 30;

export const wrongView: View = (root, app) => {
  let onlyOpen = true;
  let shown = PAGE;

  const render = () => {
    const prog = app.store.prog;
    const all = BANK.filter((q) => (prog[q.n]?.wrong ?? 0) > 0).sort(
      (a, b) => prog[b.n].wrong - prog[a.n].wrong || prog[b.n].t - prog[a.n].t,
    );
    const open = all.filter((q) => !isMastered(prog[q.n]));
    const list = onlyOpen ? open : all;
    const text = list.map((q) => `${questionAsText(q)}\n（錯 ${prog[q.n].wrong} 次）`).join('\n\n');

    mount(
      root,
      html`
        <h1 tabindex="-1">錯題本</h1>
        <section class="card">
          <p>答錯過 <strong>${all.length}</strong> 題，其中 <strong>${open.length}</strong> 題還沒練到已熟。依答錯次數排序。</p>
          <div class="row">
            ${open.length ? html`<a class="btn primary" href="#/study?scope=wrongbook&go=1">練習錯題本</a>` : ''}
            <button class="btn small ${onlyOpen ? 'on' : ''}" data-act="open" aria-pressed="${onlyOpen ? 'true' : 'false'}">還沒克服的（${open.length}）</button>
            <button class="btn small ${onlyOpen ? '' : 'on'}" data-act="all" aria-pressed="${onlyOpen ? 'false' : 'true'}">全部（${all.length}）</button>
          </div>
        </section>

        ${list.length === 0
          ? html`<section class="card"><p class="muted">${all.length ? '錯題都已經練到已熟了。' : '目前沒有錯題。去背題或考一份模擬考，答錯的題會自動收進來。'}</p></section>`
          : ''}

        ${list.slice(0, shown).map((q) => {
          const p = prog[q.n];
          return html`<article class="card review ${isMastered(p) ? 'right' : 'wrong'}">
            <p class="qmeta">
              <span class="mono">題庫 #${q.n}</span> ${categoryTag(q)}
              <span class="${isMastered(p) ? 'ok-text' : 'bad-text'}">錯 ${p.wrong} 次／作答 ${p.seen} 次${isMastered(p) ? '・已克服' : ''}</span>
            </p>
            ${questionBody(q)} ${reviewOptions(q, 0)}
          </article>`;
        })}

        ${list.length > shown ? html`<div class="row"><button class="btn" data-act="more">再顯示 ${Math.min(PAGE, list.length - shown)} 題</button></div>` : ''}

        ${list.length
          ? html`<section class="card">
              <h2 class="h3">匯出文字清單</h2>
              <textarea readonly rows="6" data-el="summary">${text}</textarea>
              <div class="row"><button class="btn" data-act="copy">複製</button><span class="muted small" role="status" data-el="copied"></span></div>
            </section>`
          : ''}
      `,
    );
  };

  on(root, 'click', '[data-act="open"]', () => {
    onlyOpen = true;
    shown = PAGE;
    render();
  });
  on(root, 'click', '[data-act="all"]', () => {
    onlyOpen = false;
    shown = PAGE;
    render();
  });
  on(root, 'click', '[data-act="more"]', () => {
    shown += PAGE;
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

  render();
  return { refresh: render };
};
