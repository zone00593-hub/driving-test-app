import { CONFIG } from '../config';
import type { Activity, Prog, ProgMap, Question } from '../types';

const MAX = CONFIG.study.masteredAt;

/** 背題模式作答後的新進度：答對熟練度 +1（上限 MAX），答錯歸零。 */
export function applyStudyAnswer(prev: Prog | undefined, correct: boolean, now: number): Prog {
  const base = prev ?? { s: 0, seen: 0, wrong: 0, t: 0 };
  return {
    s: correct ? Math.min(MAX, base.s + 1) : 0,
    seen: base.seen + 1,
    wrong: base.wrong + (correct ? 0 : 1),
    t: now,
  };
}

/**
 * 模擬考作答後的新進度：答錯歸零；答對只把「沒看過或剛答錯」的題升到 1，
 * 不會因為考試猜對一次就直接算熟。
 */
export function applyExamAnswer(prev: Prog | undefined, correct: boolean, now: number): Prog {
  const base = prev ?? { s: 0, seen: 0, wrong: 0, t: 0 };
  return {
    s: correct ? Math.max(base.s, 1) : 0,
    seen: base.seen + 1,
    wrong: base.wrong + (correct ? 0 : 1),
    t: now,
  };
}

export function isMastered(p: Prog | undefined): boolean {
  return !!p && p.s >= MAX;
}

/** 還不會：最近一次答錯（熟練度 0 且作答過）。 */
export function isWeak(p: Prog | undefined): boolean {
  return !!p && p.seen > 0 && p.s === 0;
}

/**
 * 兩筆進度誰比較新。時間較新者勝；時間相同時用固定規則決勝，
 * 讓兩台裝置不論合併順序都得到同一個結果（合併必須可交換）。
 */
export function newer(a: Prog, b: Prog): Prog {
  if (a.t !== b.t) return a.t > b.t ? a : b;
  if (a.seen !== b.seen) return a.seen > b.seen ? a : b;
  if (a.wrong !== b.wrong) return a.wrong > b.wrong ? a : b;
  return a.s >= b.s ? a : b;
}

export function sameProg(a: Prog, b: Prog): boolean {
  return a.s === b.s && a.seen === b.seen && a.wrong === b.wrong && a.t === b.t;
}

export interface MergeResult {
  merged: ProgMap;
  /** 合併後與 local 不同的題號（需要寫回本機）。 */
  changedLocal: number[];
  /** 合併後與 remote 不同的題號（需要上傳）。 */
  toPush: number[];
}

/** 以 Last-Writer-Wins 合併本機與遠端進度。 */
export function mergeProgress(local: ProgMap, remote: ProgMap): MergeResult {
  const merged: ProgMap = {};
  const changedLocal: number[] = [];
  const toPush: number[] = [];
  const keys = new Set<number>([...Object.keys(local), ...Object.keys(remote)].map(Number));
  for (const n of keys) {
    const l = local[n];
    const r = remote[n];
    const win = l && r ? newer(l, r) : (l ?? r)!;
    merged[n] = win;
    if (!l || !sameProg(l, win)) changedLocal.push(n);
    if (!r || !sameProg(r, win)) toPush.push(n);
  }
  return { merged, changedLocal, toPush };
}

/** 每日題數合併：取較大值（同一天兩台裝置各自累計時，不會少算到比任一台還少）。 */
export function mergeActivity(a: Activity, b: Activity): Activity {
  const out: Activity = { ...a };
  for (const [day, n] of Object.entries(b)) out[day] = Math.max(out[day] ?? 0, n);
  return out;
}

/** 本地日期 YYYY-MM-DD。 */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 連續練習天數：從今天（今天還沒練則從昨天）往回數連續有作答的天數。 */
export function streak(activity: Activity, now: number): number {
  const DAY = 86_400_000;
  let cursor = now;
  if (!(activity[dayKey(cursor)] > 0)) cursor -= DAY;
  let n = 0;
  while (activity[dayKey(cursor)] > 0) {
    n++;
    cursor -= DAY;
  }
  return n;
}

export interface Summary {
  total: number;
  mastered: number;
  weak: number;
  seen: number;
}

export function summarize(bank: readonly Question[], prog: ProgMap): Summary {
  let mastered = 0;
  let weak = 0;
  let seen = 0;
  for (const q of bank) {
    const p = prog[q.n];
    if (!p) continue;
    if (p.seen > 0) seen++;
    if (isMastered(p)) mastered++;
    else if (isWeak(p)) weak++;
  }
  return { total: bank.length, mastered, weak, seen };
}

export interface CategoryStat {
  c: 1 | 2 | 3;
  total: number;
  mastered: number;
  answers: number;
  correct: number;
}

/** 各架構的已熟題數與作答正確率。 */
export function categoryStats(bank: readonly Question[], prog: ProgMap): CategoryStat[] {
  const stats: CategoryStat[] = ([1, 2, 3] as const).map((c) => ({ c, total: 0, mastered: 0, answers: 0, correct: 0 }));
  for (const q of bank) {
    const st = stats[q.c - 1];
    st.total++;
    const p = prog[q.n];
    if (!p) continue;
    if (isMastered(p)) st.mastered++;
    st.answers += p.seen;
    st.correct += p.seen - p.wrong;
  }
  return stats;
}
