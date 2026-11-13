export type Choice = 1 | 2 | 3;

/** 題庫的一題。資料來自 src/data/bank.json。 */
export interface Question {
  /** 官方題庫題號（1–1090）。 */
  n: number;
  /** 架構：1 觀念與態度、2 主動停讓、3 安全駕駛能力。 */
  c: 1 | 2 | 3;
  q: string;
  o: [string, string, string];
  a: Choice;
  /** 題目附圖（標誌、標線）。 */
  img?: string;
  /** 選項本身是圖片，只能選 1/2/3。 */
  full?: boolean;
}

/** 單一題目的練習進度。整筆以 t（最後更新時間）做 Last-Writer-Wins 合併。 */
export interface Prog {
  /** 熟練度 0–2：連續答對次數，答錯歸零。 */
  s: number;
  /** 作答次數。 */
  seen: number;
  /** 答錯次數。 */
  wrong: number;
  /** 最後更新時間（epoch 毫秒）。 */
  t: number;
}

export type ProgMap = Record<number, Prog>;

export interface Attempt {
  id: string;
  /** 交卷時間（epoch 毫秒）。 */
  at: number;
  total: number;
  wrong: number;
  seconds: number;
  passed: boolean;
  wrongQnos: number[];
}

/** 每日作答題數，鍵為本地日期 YYYY-MM-DD。 */
export type Activity = Record<string, number>;

export type Rng = () => number;
