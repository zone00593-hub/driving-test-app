import raw from '../data/bank.json';
import type { Question } from '../types';

export const BANK: readonly Question[] = raw as unknown as Question[];

const byNo = new Map<number, Question>(BANK.map((q) => [q.n, q]));

export function questionByNo(n: number): Question | undefined {
  return byNo.get(n);
}

/** 圖片網址。用相對路徑，讓網站放在任何子路徑下都能運作。 */
export function imageUrl(q: Question): string | null {
  return q.img ? `./${q.img}` : null;
}
