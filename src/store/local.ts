import { dayKey } from '../core/progress';
import type { Activity, Attempt, Prog, ProgMap } from '../types';

/** 最小的鍵值儲存介面；瀏覽器用 localStorage，測試用記憶體版。 */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** localStorage 可能被停用或已滿（無痕模式、隱私設定）；失敗時退回記憶體，網站照常運作。 */
export function safeLocalStorage(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = '__dt_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    const fallback = new MemoryKV();
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return fallback.getItem(k);
        }
      },
      setItem: (k, v) => {
        try {
          ls.setItem(k, v);
        } catch {
          fallback.setItem(k, v);
        }
      },
      removeItem: (k) => {
        try {
          ls.removeItem(k);
        } catch {
          fallback.removeItem(k);
        }
      },
    };
  } catch {
    return new MemoryKV();
  }
}

interface Blob {
  v: 1;
  prog: ProgMap;
  attempts: Attempt[];
  activity: Activity;
  dirtyProg: number[];
  dirtyAttempts: string[];
  dirtyDays: string[];
}

export const GUEST = 'guest';

/**
 * 一個擁有者（訪客或某個帳號）在這台裝置上的全部資料。
 * 同時記錄「還沒上傳」的項目，離線時累積，上線後由 SyncEngine 送出。
 */
export class LocalStore {
  prog: ProgMap = {};
  attempts: Attempt[] = [];
  activity: Activity = {};
  dirtyProg = new Set<number>();
  dirtyAttempts = new Set<string>();
  dirtyDays = new Set<string>();

  constructor(
    private kv: KV,
    readonly owner: string,
  ) {
    this.load();
  }

  private get key() {
    return `dt:v1:${this.owner}`;
  }

  private load() {
    try {
      const raw = this.kv.getItem(this.key);
      if (!raw) return;
      const b = JSON.parse(raw) as Partial<Blob>;
      this.prog = b.prog ?? {};
      this.attempts = b.attempts ?? [];
      this.activity = b.activity ?? {};
      this.dirtyProg = new Set(b.dirtyProg ?? []);
      this.dirtyAttempts = new Set(b.dirtyAttempts ?? []);
      this.dirtyDays = new Set(b.dirtyDays ?? []);
    } catch {
      // 資料損毀時從空白開始，不讓整個網站壞掉。
    }
  }

  persist() {
    const b: Blob = {
      v: 1,
      prog: this.prog,
      attempts: this.attempts,
      activity: this.activity,
      dirtyProg: [...this.dirtyProg],
      dirtyAttempts: [...this.dirtyAttempts],
      dirtyDays: [...this.dirtyDays],
    };
    this.kv.setItem(this.key, JSON.stringify(b));
  }

  get isEmpty() {
    return Object.keys(this.prog).length === 0 && this.attempts.length === 0;
  }

  /** 記錄一題的作答結果，並把今天的作答題數 +1。 */
  recordAnswer(qno: number, next: Prog) {
    this.prog[qno] = next;
    this.dirtyProg.add(qno);
    const day = dayKey(next.t);
    this.activity[day] = (this.activity[day] ?? 0) + 1;
    this.dirtyDays.add(day);
    this.persist();
  }

  addAttempt(a: Attempt) {
    this.attempts.push(a);
    this.dirtyAttempts.add(a.id);
    this.persist();
  }

  /** 清掉這個擁有者在本機的所有資料。 */
  clear() {
    this.prog = {};
    this.attempts = [];
    this.activity = {};
    this.dirtyProg.clear();
    this.dirtyAttempts.clear();
    this.dirtyDays.clear();
    this.kv.removeItem(this.key);
  }
}
