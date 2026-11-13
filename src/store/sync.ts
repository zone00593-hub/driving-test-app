import type { Backend, ProgRow } from '../backend/types';
import { mergeActivity, mergeProgress } from '../core/progress';
import type { Activity, Prog, ProgMap } from '../types';
import type { LocalStore } from './local';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
  /** 還沒上傳的項目數。 */
  pending: number;
}

export interface SyncOptions {
  debounceMs: number;
  now: () => number;
  isOnline: () => boolean;
  /** 遠端帶來新資料、本機內容因此改變時呼叫（讓畫面重新整理）。 */
  onRemoteChange?: () => void;
  onState?: (s: SyncState) => void;
}

const toRow = (qno: number, p: Prog): ProgRow => ({ qno, score: p.s, seen: p.seen, wrong: p.wrong, updated_at: p.t });
const fromRow = (r: ProgRow): Prog => ({ s: r.score, seen: r.seen, wrong: r.wrong, t: r.updated_at });

/**
 * 本機優先的同步：作答永遠先寫本機，再於背景上傳。
 * - pushDirty：只上傳還沒送出的項目（每次作答後延遲觸發）。
 * - fullSync ：把遠端全部拉回來，逐題以時間戳合併，再把本機較新的送上去
 *              （登入時、恢復連線時、回到分頁時、以及定時執行）。
 * 所有操作排成一列依序執行，不會互相打架；失敗就保留待上傳清單，下次再試。
 */
export class SyncEngine {
  private state: SyncState = { status: 'idle', lastSyncAt: null, error: null, pending: 0 };
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private store: LocalStore,
    private backend: Backend,
    private opts: SyncOptions,
  ) {
    this.state.pending = this.pendingCount();
  }

  getState(): SyncState {
    return { ...this.state, pending: this.pendingCount() };
  }

  private pendingCount() {
    return this.store.dirtyProg.size + this.store.dirtyAttempts.size + this.store.dirtyDays.size;
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch, pending: this.pendingCount() };
    this.opts.onState?.(this.getState());
  }

  /** 作答後呼叫：稍等一下再上傳，連續作答只會送一次。 */
  schedulePush() {
    if (this.stopped) return;
    this.set({});
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pushDirty();
    }, this.opts.debounceMs);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  pushDirty(): Promise<void> {
    return this.enqueue(() => this.doPush());
  }

  fullSync(): Promise<void> {
    return this.enqueue(() => this.doFullSync());
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = async () => {
      if (this.stopped) return;
      if (!this.opts.isOnline()) {
        this.set({ status: 'offline', error: null });
        return;
      }
      this.set({ status: 'syncing', error: null });
      try {
        await job();
        if (this.stopped) return;
        this.set({ status: 'synced', lastSyncAt: this.opts.now(), error: null });
      } catch (e) {
        if (this.stopped) return;
        const offline = !this.opts.isOnline();
        this.set({ status: offline ? 'offline' : 'error', error: offline ? null : ((e as Error)?.message ?? '同步失敗') });
      }
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private async doPush() {
    const { store } = this;

    const qnos = [...store.dirtyProg];
    if (qnos.length) {
      const sent = new Map<number, number>();
      const rows = qnos.flatMap((n) => {
        const p = store.prog[n];
        if (!p) return [];
        sent.set(n, p.t);
        return [toRow(n, p)];
      });
      await this.backend.pushProgress(rows);
      // 上傳期間使用者可能又答了同一題；只有內容沒再變的才算送達。
      for (const n of qnos) if (!store.prog[n] || store.prog[n].t === sent.get(n)) store.dirtyProg.delete(n);
      store.persist();
    }

    const ids = [...store.dirtyAttempts];
    if (ids.length) {
      await this.backend.pushAttempts(store.attempts.filter((a) => ids.includes(a.id)));
      ids.forEach((id) => store.dirtyAttempts.delete(id));
      store.persist();
    }

    const days = [...store.dirtyDays];
    if (days.length) {
      const sent: Activity = {};
      for (const d of days) sent[d] = store.activity[d] ?? 0;
      await this.backend.pushActivity(sent);
      for (const d of days) if ((store.activity[d] ?? 0) === sent[d]) store.dirtyDays.delete(d);
      store.persist();
    }
  }

  private async doFullSync() {
    const { store } = this;
    const [rows, remoteAttempts, remoteActivity] = await Promise.all([
      this.backend.pullProgress(),
      this.backend.pullAttempts(),
      this.backend.pullActivity(),
    ]);
    let changed = false;

    // 進度：逐題 Last-Writer-Wins。
    const remote: ProgMap = {};
    for (const r of rows) remote[r.qno] = fromRow(r);
    const m = mergeProgress(store.prog, remote);
    if (m.changedLocal.length) changed = true;
    store.prog = m.merged;
    store.dirtyProg = new Set(m.toPush);

    // 模擬考紀錄：只會新增，依 id 取聯集。
    const localIds = new Set(store.attempts.map((a) => a.id));
    const remoteIds = new Set(remoteAttempts.map((a) => a.id));
    for (const a of remoteAttempts) {
      if (!localIds.has(a.id)) {
        store.attempts.push(a);
        changed = true;
      }
    }
    store.attempts.sort((a, b) => a.at - b.at);
    store.dirtyAttempts = new Set(store.attempts.filter((a) => !remoteIds.has(a.id)).map((a) => a.id));

    // 每日題數：取較大值。
    const mergedActivity = mergeActivity(store.activity, remoteActivity);
    for (const d of Object.keys(mergedActivity)) if (mergedActivity[d] !== (store.activity[d] ?? 0)) changed = true;
    store.activity = mergedActivity;
    store.dirtyDays = new Set(Object.keys(mergedActivity).filter((d) => mergedActivity[d] !== (remoteActivity[d] ?? 0)));

    store.persist();
    if (changed) this.opts.onRemoteChange?.();
    await this.doPush();
  }
}
