import { CONFIG } from '../config';
import type { Choice, Question, Rng } from '../types';
import { shuffled } from './study';

/** 從題庫不重複地隨機抽 n 題。 */
export function drawExam(bank: readonly Question[], n: number, rng: Rng): Question[] {
  return shuffled(bank, rng).slice(0, Math.min(n, bank.length));
}

export interface Grade {
  total: number;
  right: number;
  wrong: number;
  score: number;
  maxScore: number;
  passed: boolean;
  /** 答錯或未作答的題庫題號。 */
  wrongQnos: number[];
}

/** 計分：未作答視為答錯。answers[i] 對應 questions[i]，0 代表未作答。 */
export function grade(questions: readonly Question[], answers: readonly (Choice | 0)[]): Grade {
  const wrongQnos: number[] = [];
  questions.forEach((q, i) => {
    if (answers[i] !== q.a) wrongQnos.push(q.n);
  });
  const total = questions.length;
  const right = total - wrongQnos.length;
  const per = CONFIG.exam.pointsPerQuestion;
  const score = right * per;
  return {
    total,
    right,
    wrong: wrongQnos.length,
    score,
    maxScore: total * per,
    passed: score >= CONFIG.exam.passScore,
    wrongQnos,
  };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
