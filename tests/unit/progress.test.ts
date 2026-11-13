import { describe, expect, it } from 'vitest';
import {
  applyExamAnswer,
  applyStudyAnswer,
  categoryStats,
  dayKey,
  isMastered,
  isWeak,
  mergeActivity,
  mergeProgress,
  newer,
  streak,
  summarize,
} from '../../src/core/progress';
import type { Prog, ProgMap, Question } from '../../src/types';

const p = (s: number, seen: number, wrong: number, t: number): Prog => ({ s, seen, wrong, t });

describe('背題的熟練度', () => {
  it('第一次答對是 1，第二次答對算已熟，之後不再往上加', () => {
    const a = applyStudyAnswer(undefined, true, 100);
    expect(a).toEqual(p(1, 1, 0, 100));
    const b = applyStudyAnswer(a, true, 200);
    expect(b.s).toBe(2);
    expect(isMastered(b)).toBe(true);
    expect(applyStudyAnswer(b, true, 300).s).toBe(2);
  });

  it('答錯會歸零，並累計答錯次數', () => {
    const mastered = p(2, 5, 1, 100);
    const after = applyStudyAnswer(mastered, false, 200);
    expect(after).toEqual(p(0, 6, 2, 200));
    expect(isWeak(after)).toBe(true);
    expect(isMastered(after)).toBe(false);
  });

  it('沒做過的題不算「還不會」', () => {
    expect(isWeak(undefined)).toBe(false);
  });
});

describe('模擬考對進度的影響', () => {
  it('考試猜對一次不會直接算已熟', () => {
    expect(applyExamAnswer(undefined, true, 1).s).toBe(1);
    expect(applyExamAnswer(p(1, 1, 0, 1), true, 2).s).toBe(1);
  });
  it('考試答對不會讓已熟的題退步；答錯會歸零', () => {
    expect(applyExamAnswer(p(2, 3, 0, 1), true, 2).s).toBe(2);
    expect(applyExamAnswer(p(2, 3, 0, 1), false, 2)).toEqual(p(0, 4, 1, 2));
  });
});

describe('兩台裝置的進度合併（Last-Writer-Wins）', () => {
  it('同一題取時間較新的那一筆', () => {
    const local: ProgMap = { 1: p(2, 2, 0, 100), 2: p(0, 1, 1, 500) };
    const remote: ProgMap = { 1: p(0, 3, 1, 300), 2: p(2, 2, 0, 400), 3: p(1, 1, 0, 50) };
    const r = mergeProgress(local, remote);
    expect(r.merged).toEqual({ 1: p(0, 3, 1, 300), 2: p(0, 1, 1, 500), 3: p(1, 1, 0, 50) });
    expect(r.changedLocal.sort()).toEqual([1, 3]);
    expect(r.toPush).toEqual([2]);
  });

  it('合併順序不影響結果（可交換），重複合併也不會變（冪等）', () => {
    const a: ProgMap = { 1: p(1, 1, 0, 100), 2: p(2, 4, 1, 100), 5: p(0, 1, 1, 9) };
    const b: ProgMap = { 1: p(0, 2, 1, 100), 2: p(2, 4, 1, 100), 7: p(2, 2, 0, 3) };
    const ab = mergeProgress(a, b).merged;
    const ba = mergeProgress(b, a).merged;
    expect(ab).toEqual(ba);
    expect(mergeProgress(ab, b).merged).toEqual(ab);
    expect(mergeProgress(ab, ab).toPush).toEqual([]);
  });

  it('時間相同時用固定規則決勝', () => {
    expect(newer(p(1, 1, 0, 100), p(0, 2, 1, 100))).toEqual(p(0, 2, 1, 100));
  });
});

describe('每日題數與連續天數', () => {
  const DAY = 86_400_000;
  const noon = new Date(2026, 10, 11, 12, 0, 0).getTime();

  it('合併取較大值', () => {
    expect(mergeActivity({ a: 3, b: 1 }, { a: 2, c: 5 })).toEqual({ a: 3, b: 1, c: 5 });
  });

  it('今天有練：從今天往回數', () => {
    const act = { [dayKey(noon)]: 3, [dayKey(noon - DAY)]: 1, [dayKey(noon - 2 * DAY)]: 9, [dayKey(noon - 4 * DAY)]: 2 };
    expect(streak(act, noon)).toBe(3);
  });

  it('今天還沒練：連續天數不會中斷，從昨天往回數', () => {
    const act = { [dayKey(noon - DAY)]: 1, [dayKey(noon - 2 * DAY)]: 9 };
    expect(streak(act, noon)).toBe(2);
  });

  it('昨天和今天都沒練就是 0', () => {
    expect(streak({ [dayKey(noon - 2 * DAY)]: 9 }, noon)).toBe(0);
  });

  it('dayKey 用本地日期', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('統計', () => {
  const q = (n: number, c: 1 | 2 | 3): Question => ({ n, c, q: 'x', o: ['a', 'b', 'c'], a: 1 });
  const bank = [q(1, 1), q(2, 1), q(3, 2), q(4, 3)];
  const prog: ProgMap = { 1: p(2, 2, 0, 1), 2: p(0, 3, 2, 1), 3: p(1, 1, 0, 1) };

  it('summarize 數出已熟、還不會、做過的題數', () => {
    expect(summarize(bank, prog)).toEqual({ total: 4, mastered: 1, weak: 1, seen: 3 });
  });

  it('categoryStats 算出各架構的已熟題數與正確率', () => {
    const cats = categoryStats(bank, prog);
    expect(cats[0]).toEqual({ c: 1, total: 2, mastered: 1, answers: 5, correct: 3 });
    expect(cats[2]).toEqual({ c: 3, total: 1, mastered: 0, answers: 0, correct: 0 });
  });
});
