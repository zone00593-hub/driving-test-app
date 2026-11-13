import type { Activity, Attempt } from '../types';

export interface User {
  id: string;
  email: string;
}

/** 傳輸用的進度列。updated_at 為 epoch 毫秒。 */
export interface ProgRow {
  qno: number;
  score: number;
  seen: number;
  wrong: number;
  updated_at: number;
}

/** 給使用者看的錯誤（訊息已是中文）。 */
export class BackendError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

/**
 * 介面只依賴這個抽象，不直接碰 Supabase。
 * 實作有三種：SupabaseBackend（正式）、MockBackend（測試）、NoneBackend（沒設定後端，只有訪客模式）。
 */
export interface Backend {
  readonly kind: 'supabase' | 'mock' | 'none';
  /** false 表示沒有設定後端，只能用訪客模式。 */
  readonly available: boolean;

  getUser(): Promise<User | null>;
  /** 登入狀態改變時通知；回傳取消訂閱函式。 */
  onAuthChange(cb: (user: User | null) => void): () => void;
  /** 使用者從「重設密碼」信件連結回來時通知。 */
  onPasswordRecovery(cb: () => void): () => void;

  signUp(email: string, password: string): Promise<{ needsEmailConfirm: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** 刪除帳號與雲端上的所有資料。 */
  deleteAccount(): Promise<void>;

  pullProgress(): Promise<ProgRow[]>;
  pushProgress(rows: ProgRow[]): Promise<void>;
  pullAttempts(): Promise<Attempt[]>;
  pushAttempts(attempts: Attempt[]): Promise<void>;
  pullActivity(): Promise<Activity>;
  pushActivity(days: Activity): Promise<void>;
}

const unavailable = () => Promise.reject(new BackendError('這個網站沒有設定雲端後端，只能用訪客模式。'));

export class NoneBackend implements Backend {
  readonly kind = 'none' as const;
  readonly available = false;
  getUser = () => Promise.resolve(null);
  onAuthChange = () => () => {};
  onPasswordRecovery = () => () => {};
  signUp = unavailable;
  signIn = unavailable;
  signOut = () => Promise.resolve();
  sendPasswordReset = unavailable;
  updatePassword = unavailable;
  deleteAccount = unavailable;
  pullProgress = unavailable;
  pushProgress = unavailable;
  pullAttempts = unavailable;
  pushAttempts = unavailable;
  pullActivity = unavailable;
  pushActivity = unavailable;
}
