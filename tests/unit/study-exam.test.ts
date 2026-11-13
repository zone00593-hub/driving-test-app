import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { drawExam, formatClock, grade } from '../../src/core/exam';
import { advanceQueue, buildPool, correctPosition, DEFAULT_FILTER, optionOrder, shuffled } from '../../src/core/study';
import type { Choice, Prog, ProgMap, Question, Rng } from '../../src/types';

/** 可重現的亂數（mulberry32），讓隨機邏輯可以測。 */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (n: number, extra: Partial<Question> = {}): Question => ({ n, c: 1, q: `題目${n}`, o: ['甲', '乙', '丙'], a: 2, ...extra });
const bank = Array.from({ length: 100 }, (_v, i) => q(i + 1, { c: ((i % 3) + 1) as 1 | 2 | 3, img: i < 10 ? `img/${i + 1}.jpg` : undefined }));
const p = (s: number, seen: number, wrong: number): Prog => ({ s, seen, wrong, t: 1 });

describe('洗牌與抽題', () => {
  it('洗牌不會遺失或重複元素，也不會改到原陣列', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(src, seeded(1));
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('模擬考抽出指定題數且不重複', () => {
    const exam = drawExam(bank, CONFIG.exam.questions, seeded(7));
    expect(exam).toHaveLength(CONFIG.exam.questions);
    expect(new Set(exam.map((x) => x.n)).size).toBe(CONFIG.exam.questions);
  });

  it('題庫比題數少時，全部抽出', () => {
    expect(drawExam(bank.slice(0, 5), 50, seeded(1))).toHaveLength(5);
  });

  it('每一題被抽中的機會大致相等', () => {
    const rng = seeded(42);
    const hits = new Map<number, number>();
    const rounds = 4000;
    for (let i = 0; i < rounds; i++) for (const x of drawExam(bank, 10, rng)) hits.set(x.n, (hits.get(x.n) ?? 0) + 1);
    const expected = (rounds * 10) / bank.length; // 400
    for (const n of bank.map((x) => x.n)) {
      expect(hits.get(n) ?? 0).toBeGreaterThan(expected * 0.8);
      expect(hits.get(n) ?? 0).toBeLessThan(expected * 1.2);
    }
  });
});

describe('背題的題目範圍', () => {
  const prog: ProgMap = { 1: p(2, 2, 0), 2: p(0, 1, 1), 3: p(1, 3, 1), 4: p(2, 4, 2) };

  it('預設依題號，並略過已熟的題', () => {
    const pool = buildPool(bank, prog, DEFAULT_FILTER, seeded(1));
    expect(pool.map((x) => x.n).slice(0, 3)).toEqual([2, 3, 5]);
    expect(pool).toHaveLength(98);
  });

  it('還不會：只有最近答錯的題', () => {
    expect(buildPool(bank, prog, { ...DEFAULT_FILTER, scope: 'weak' }, seeded(1)).map((x) => x.n)).toEqual([2]);
  });

  it('錯題本：答錯過的題；關掉「略過已熟」才會包含已克服的', () => {
    expect(buildPool(bank, prog, { ...DEFAULT_FILTER, scope: 'wrongbook' }, seeded(1)).map((x) => x.n)).toEqual([2, 3]);
    expect(buildPool(bank, prog, { ...DEFAULT_FILTER, scope: 'wrongbook', hideMastered: false }, seeded(1)).map((x) => x.n)).toEqual([2, 3, 4]);
  });

  it('還沒做過、看圖題、依架構', () => {
    expect(buildPool(bank, prog, { ...DEFAULT_FILTER, scope: 'new' }, seeded(1))).toHaveLength(96);
    expect(buildPool(bank, {}, { ...DEFAULT_FILTER, scope: 'img' }, seeded(1))).toHaveLength(10);
    expect(buildPool(bank, {}, { ...DEFAULT_FILTER, scope: 'c2' }, seeded(1)).every((x) => x.c === 2)).toBe(true);
  });

  it('隨機順序包含同一批題目', () => {
    const seq = buildPool(bank, prog, DEFAULT_FILTER, seeded(1)).map((x) => x.n);
    const rnd = buildPool(bank, prog, { ...DEFAULT_FILTER, order: 'rnd' }, seeded(1)).map((x) => x.n);
    expect(rnd).not.toEqual(seq);
    expect(rnd.slice().sort((a, b) => a - b)).toEqual(seq);
  });
});

describe('作答後的佇列', () => {
  const queue = bank.slice(0, 20);

  it('答錯：隔幾題再出現', () => {
    const next = advanceQueue(queue, p(0, 1, 1));
    expect(next).toHaveLength(20);
    expect(next[CONFIG.study.requeueAfterWrong].n).toBe(1);
    expect(next[0].n).toBe(2);
  });

  it('答對但還沒熟：隔久一點再出現', () => {
    const next = advanceQueue(queue, p(1, 1, 0));
    expect(next[CONFIG.study.requeueAfterRight].n).toBe(1);
  });

  it('已熟：移出佇列', () => {
    const next = advanceQueue(queue, p(2, 2, 0));
    expect(next).toHaveLength(19);
    expect(next.some((x) => x.n === 1)).toBe(false);
  });

  it('佇列快空時放到最後；只剩一題答錯就一直重複那一題', () => {
    expect(advanceQueue(queue.slice(0, 2), p(0, 1, 1)).map((x) => x.n)).toEqual([2, 1]);
    expect(advanceQueue(queue.slice(0, 1), p(0, 1, 1)).map((x) => x.n)).toEqual([1]);
    expect(advanceQueue([], p(0, 1, 1))).toEqual([]);
  });
});

describe('打亂選項', () => {
  it('不打亂時維持原順序', () => {
    expect(optionOrder(q(1), false, seeded(1))).toEqual([0, 1, 2]);
  });

  it('選項是圖片的題永遠不打亂', () => {
    expect(optionOrder(q(1, { full: true }), true, seeded(1))).toEqual([0, 1, 2]);
  });

  it('打亂後，正解位置永遠指向原本的正解內容', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
      const question = q(i, { a: ((i % 3) + 1) as Choice });
      const order = optionOrder(question, true, rng);
      expect(order.slice().sort()).toEqual([0, 1, 2]);
      const pos = correctPosition(question, order);
      expect(question.o[order[pos - 1]]).toBe(question.o[question.a - 1]);
    }
  });
});

describe('計分', () => {
  const qs = Array.from({ length: 50 }, (_v, i) => q(i + 1, { a: 1 }));
  const answers = (wrong: number, blank = 0): (Choice | 0)[] => qs.map((_x, i) => (i < blank ? 0 : i < blank + wrong ? 2 : 1));

  it('全對 100 分', () => {
    expect(grade(qs, answers(0))).toMatchObject({ right: 50, wrong: 0, score: 100, maxScore: 100, passed: true, wrongQnos: [] });
  });

  it('錯 7 題 86 分及格，錯 8 題 84 分不及格（及格線 85）', () => {
    expect(grade(qs, answers(7))).toMatchObject({ score: 86, passed: true });
    expect(grade(qs, answers(8))).toMatchObject({ score: 84, passed: false });
  });

  it('未作答算錯，並列在錯題題號裡', () => {
    const g = grade(qs, answers(1, 2));
    expect(g.wrong).toBe(3);
    expect(g.wrongQnos).toEqual([1, 2, 3]);
  });

  it('時間格式', () => {
    expect(formatClock(1800)).toBe('30:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(-3)).toBe('00:00');
  });
});
