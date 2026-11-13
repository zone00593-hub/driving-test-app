import { CATEGORY_NAMES } from '../config';
import { imageUrl } from '../core/bank';
import type { Choice, Question } from '../types';
import { html, type Safe } from './dom';

export function categoryTag(q: Question): Safe {
  return html`<span class="tag">${CATEGORY_NAMES[q.c]}</span>`;
}

/** 題目本體：附圖（若有）與題幹。 */
export function questionBody(q: Question, label?: string): Safe {
  const url = imageUrl(q);
  const alt = q.full ? '題目圖片，含三個圖片選項' : '題目附圖（交通標誌或標線）';
  return html`
    ${url ? html`<img class="qimg ${q.full ? 'qimg-full' : ''}" src="${url}" alt="${alt}" loading="lazy" />` : ''}
    ${q.q ? html`<p class="stem">${label ? html`<span class="stem-no">${label}</span>` : ''}${q.q}</p>` : label ? html`<p class="stem"><span class="stem-no">${label}</span>這個圖代表什麼？</p>` : ''}
  `;
}

/** 選項顯示的文字；選項是圖片的題只顯示編號。 */
export function optionLabel(q: Question, originalIndex: number, position: number): Safe {
  return q.full ? html`<span class="opt-no">${position}</span><span>圖 ${position}</span>` : html`<span class="opt-no">${position}</span><span>${q.o[originalIndex]}</span>`;
}

/** 檢討用：列出三個選項，標出正解與使用者的答案。 */
export function reviewOptions(q: Question, chosen: Choice | 0): Safe {
  if (q.full) {
    return html`<p class="review-line">你的答案：${chosen || '未作答'}　正確答案：<strong>${q.a}</strong></p>`;
  }
  return html`<ol class="review-opts">
    ${q.o.map((text, i) => {
      const pos = i + 1;
      const cls = pos === q.a ? 'ok' : pos === chosen ? 'bad' : '';
      return html`<li class="${cls}">
        ${text}${pos === q.a ? html`<span class="mark">正解</span>` : ''}${pos === chosen && pos !== q.a ? html`<span class="mark">你的答案</span>` : ''}
      </li>`;
    })}
  </ol>`;
}

/** 純文字版的一題（給「複製錯題清單」用）。 */
export function questionAsText(q: Question, chosen?: Choice | 0): string {
  const head = `[題庫#${q.n}｜${CATEGORY_NAMES[q.c]}]`;
  if (q.full) return `${head}（選項是圖片，請看官方題庫第 ${q.n} 題）\n正解：${q.a}${chosen !== undefined ? `\n我選：${chosen || '未作答'}` : ''}`;
  const stem = q.q || '（看圖題）';
  const mine = chosen === undefined ? '' : `\n我選：${chosen ? `(${chosen}) ${q.o[chosen - 1]}` : '未作答'}`;
  return `${head}${q.img ? '（有圖）' : ''}${stem}${mine}\n正解：(${q.a}) ${q.o[q.a - 1]}`;
}
