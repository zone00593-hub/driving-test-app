import { CONFIG } from '../config';
import type { Choice, Prog, ProgMap, Question, Rng } from '../types';
import { isMastered, isWeak } from './progress';

export type Scope = 'all' | 'c1' | 'c2' | 'c3' | 'img' | 'weak' | 'wrongbook' | 'new';

export interface StudyFilter {
  scope: Scope;
  order: 'seq' | 'rnd';
  /** 不再出現已熟的題。 */
  hideMastered: boolean;
  /** 打亂文字選項順序（選項是圖片的題不打亂）。 */
  shuffleOptions: boolean;
}

export const DEFAULT_FILTER: StudyFilter = { scope: 'all', order: 'seq', hideMastered: true, shuffleOptions: false };

/** Fisher–Yates 洗牌，回傳新陣列。 */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function inScope(q: Question, p: Prog | undefined, scope: Scope): boolean {
  switch (scope) {
    case 'all':
      return true;
    case 'c1':
      return q.c === 1;
    case 'c2':
      return q.c === 2;
    case 'c3':
      return q.c === 3;
    case 'img':
      return !!q.img;
    case 'weak':
      return isWeak(p);
    case 'wrongbook':
      return !!p && p.wrong > 0;
    case 'new':
      return !p || p.seen === 0;
  }
}

/** 依篩選條件建立這一輪要背的題目佇列。 */
export function buildPool(bank: readonly Question[], prog: ProgMap, f: StudyFilter, rng: Rng): Question[] {
  const list = bank.filter((q) => {
    const p = prog[q.n];
    if (!inScope(q, p, f.scope)) return false;
    if (f.hideMastered && isMastered(p)) return false;
    return true;
  });
  return f.order === 'rnd' ? shuffled(list, rng) : list;
}

/**
 * 一題作答完後更新佇列：移除隊首；答錯的隔幾題再出現，
 * 答對但還沒熟的隔久一點再出現，已熟的不再出現。
 */
export function advanceQueue(queue: readonly Question[], after: Prog): Question[] {
  const [head, ...rest] = queue;
  if (!head) return [];
  if (after.s === 0) rest.splice(Math.min(CONFIG.study.requeueAfterWrong, rest.length), 0, head);
  else if (after.s < CONFIG.study.masteredAt) rest.splice(Math.min(CONFIG.study.requeueAfterRight, rest.length), 0, head);
  return rest;
}

/** 選項的顯示順序（元素是原始選項的索引 0–2）。 */
export function optionOrder(q: Question, shuffle: boolean, rng: Rng): [number, number, number] {
  if (!shuffle || q.full) return [0, 1, 2];
  return shuffled([0, 1, 2], rng) as [number, number, number];
}

/** 在給定顯示順序下，正解落在第幾個位置（1–3）。 */
export function correctPosition(q: Question, order: readonly number[]): Choice {
  return (order.indexOf(q.a - 1) + 1) as Choice;
}
