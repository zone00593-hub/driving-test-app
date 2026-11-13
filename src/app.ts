import { createBackend } from './backend';
import type { Backend, User } from './backend/types';
import { CONFIG } from './config';
import { applyExamAnswer, applyStudyAnswer, mergeActivity, mergeProgress } from './core/progress';
import { GUEST, LocalStore, MemoryKV, safeLocalStorage, type KV } from './store/local';
import { SyncEngine, type SyncState } from './store/sync';
import type { Attempt, Prog } from './types';

function safeSessionStorage(): KV {
  try {
    const ss = globalThis.sessionStorage;
    ss.setItem('__dt_probe__', '1');
    ss.removeItem('__dt_probe__');
    return ss;
  } catch {
    return new MemoryKV();
  }
}

/**
 * 整個網站的狀態中心：目前是誰（訪客或帳號）、他的本機資料、同步引擎。
 * 畫面只跟這個物件互動，不直接碰儲存或後端。
 */
export class App {
  readonly kv: KV = safeLocalStorage();
  /** 分頁層級的暫存（進行中的模擬考），關掉分頁就消失。 */
  readonly tabKv: KV = safeSessionStorage();
  backend!: Backend;
  user: User | null = null;
  store!: LocalStore;
  sync: SyncEngine | null = null;
  /** 使用者從重設密碼信回來，正在等他輸入新密碼。 */
  recovering = false;

  private dataListeners = new Set<() => void>();
  private syncListeners = new Set<() => void>();
  private lastFullSync = 0;

  async init() {
    this.backend = await createBackend(this.kv);
    this.setOwner(await this.backend.getUser().catch(() => null));

    this.backend.onAuthChange((u) => {
      if ((u?.id ?? null) !== (this.user?.id ?? null)) {
        this.setOwner(u);
        this.emitData();
      }
    });
    this.backend.onPasswordRecovery(() => {
      this.recovering = true;
      location.hash = '#/account';
      this.emitData();
    });

    window.addEventListener('online', () => this.fullSync());
    window.addEventListener('offline', () => this.emitSync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastFullSync > 30_000) this.fullSync();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') this.fullSync();
    }, CONFIG.sync.fullSyncIntervalMs);
  }

  /** 切換資料擁有者（登入、登出時）。每個帳號與訪客的本機資料彼此分開。 */
  private setOwner(user: User | null) {
    this.sync?.stop();
    this.user = user;
    this.store = new LocalStore(this.kv, user ? user.id : GUEST);
    this.sync = user
      ? new SyncEngine(this.store, this.backend, {
          debounceMs: CONFIG.sync.pushDebounceMs,
          now: () => Date.now(),
          isOnline: () => navigator.onLine,
          onRemoteChange: () => this.emitData(),
          onState: () => this.emitSync(),
        })
      : null;
    this.fullSync();
    this.emitSync();
  }

  fullSync() {
    if (!this.sync) return Promise.resolve();
    this.lastFullSync = Date.now();
    return this.sync.fullSync();
  }

  syncState(): SyncState | null {
    return this.sync ? this.sync.getState() : null;
  }

  /** 資料變動（遠端帶來新進度、登入狀態改變）時通知畫面。 */
  onData(cb: () => void) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }
  onSync(cb: () => void) {
    this.syncListeners.add(cb);
    return () => this.syncListeners.delete(cb);
  }
  private emitData() {
    this.dataListeners.forEach((cb) => cb());
  }
  private emitSync() {
    this.syncListeners.forEach((cb) => cb());
  }

  /** 記錄一題的作答結果，回傳更新後的進度。先寫本機，再排程上傳。 */
  answer(qno: number, correct: boolean, mode: 'study' | 'exam'): Prog {
    const prev = this.store.prog[qno];
    const next = (mode === 'study' ? applyStudyAnswer : applyExamAnswer)(prev, correct, Date.now());
    this.store.recordAnswer(qno, next);
    this.sync?.schedulePush();
    return next;
  }

  addAttempt(a: Attempt) {
    this.store.addAttempt(a);
    this.sync?.schedulePush();
  }

  /** 這台裝置上是否留有訪客時期的進度（登入後可選擇合併）。 */
  guestStore(): LocalStore | null {
    if (!this.user) return null;
    const g = new LocalStore(this.kv, GUEST);
    return g.isEmpty ? null : g;
  }

  /** 把訪客進度併入目前帳號：逐題取較新的，模擬考紀錄取聯集。 */
  async mergeGuest() {
    const g = this.guestStore();
    if (!g) return;
    this.store.prog = mergeProgress(this.store.prog, g.prog).merged;
    const have = new Set(this.store.attempts.map((a) => a.id));
    for (const a of g.attempts) if (!have.has(a.id)) this.store.attempts.push(a);
    this.store.attempts.sort((a, b) => a.at - b.at);
    this.store.activity = mergeActivity(this.store.activity, g.activity);
    this.store.persist();
    g.clear();
    this.emitData();
    await this.fullSync(); // fullSync 會比對遠端，把需要上傳的全部送出
  }

  discardGuest() {
    this.guestStore()?.clear();
    this.emitData();
  }

  /** 登出。先嘗試把未上傳的送出；回傳 false 表示還有資料沒送達，需要使用者確認。 */
  async signOut(force = false): Promise<boolean> {
    if (this.sync && !force) {
      await this.sync.pushDirty();
      if (this.sync.getState().pending > 0) return false;
    }
    const store = this.store;
    this.sync?.stop();
    await this.backend.signOut().catch(() => {});
    store.clear(); // 共用裝置上不留下帳號的資料
    if (this.user) {
      this.setOwner(null);
      this.emitData();
    }
    return true;
  }

  async deleteAccount() {
    const store = this.store;
    this.sync?.stop();
    await this.backend.deleteAccount();
    store.clear();
    this.setOwner(null);
    this.emitData();
  }
}
