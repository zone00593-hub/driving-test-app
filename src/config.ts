/**
 * 所有「規則數字」集中在這裡，方便日後依官方公告調整。
 * 考試規則（題數、時間、及格分數）是依一般公開說明設定，非官方保證，
 * 介面上會提醒使用者以監理站公告為準。
 */
export const CONFIG = {
  bankVersion: '115.5.29',
  bankSource: '交通部公路局《新版汽車筆試題庫》',

  exam: {
    questions: 50,
    seconds: 30 * 60,
    pointsPerQuestion: 2,
    passScore: 85,
  },

  study: {
    /** 連續答對幾次算「已熟」。 */
    masteredAt: 2,
    /** 答錯後，隔幾題再出現。 */
    requeueAfterWrong: 4,
    /** 答對但還沒熟，隔幾題再出現。 */
    requeueAfterRight: 12,
  },

  sync: {
    pushDebounceMs: 1500,
    fullSyncIntervalMs: 60_000,
  },
} as const;

export const CATEGORY_NAMES: Record<1 | 2 | 3, string> = {
  1: '正確觀念與態度',
  2: '主動停讓文化',
  3: '安全駕駛能力',
};
