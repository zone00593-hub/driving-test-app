import { describe, expect, it } from 'vitest';
import { MockBackend } from '../../src/backend/mock';
import { applyStudyAnswer } from '../../src/core/progress';
import { LocalStore, MemoryKV } from '../../src/store/local';
import { SyncEngine, type SyncState } from '../../src/store/sync';
import type { Attempt } from '../../src/types';

/**
 * 模擬「一個雲端 + 兩台裝置」：兩台裝置各有自己的本機儲存，
 * 但登入同一個帳號、連到同一個假後端。
 */
async function world() {
  const cloud = new MemoryKV();
  const net = { a: true, b: true };
  const clock = { now: 1_000_000 };
  const signup = new MockBackend(cloud, () => true);
  await signup.signUp('kevin@example.com', 'password-1234');
  const user = (await signup.getUser())!;

  const device = (name: 'a' | 'b') => {
    const backend = new MockBackend(cloud, () => net[name]);
    const store = new LocalStore(new MemoryKV(), user.id);
    const states: SyncState[] = [];
    let remoteChanges = 0;
    const sync = new SyncEngine(store, backend, {
      debounceMs: 0,
      now: () => clock.now,
      isOnline: () => net[name],
      onState: (s) => states.push(s),
      onRemoteChange: () => remoteChanges++,
    });
    const answer = (qno: number, correct: boolean) => {
      clock.now += 1000;
      store.recordAnswer(qno, applyStudyAnswer(store.prog[qno], correct, clock.now));
    };
    return { store, sync, states, answer, remoteChanges: () => remoteChanges };
  };
  return { A: device('a'), B: device('b'), net, clock };
}

describe('跨裝置同步', () => {
  it('A 的進度會出現在 B', async () => {
    const { A, B } = await world();
    A.answer(1, true);
    A.answer(2, false);
    await A.sync.pushDirty();
    expect(A.store.dirtyProg.size).toBe(0);

    await B.sync.fullSync();
    expect(B.store.prog[1].s).toBe(1);
    expect(B.store.prog[2]).toMatchObject({ s: 0, wrong: 1 });
    expect(B.remoteChanges()).toBe(1);
    expect(B.sync.getState().status).toBe('synced');
  });

  it('兩台都改了同一題：較晚作答的那一筆勝出，兩台最後一致', async () => {
    const { A, B } = await world();
    A.answer(5, true); // 較早
    B.answer(5, false); // 較晚
    await B.sync.fullSync();
    await A.sync.fullSync(); // A 較舊的資料不會蓋掉 B
    await B.sync.fullSync();
    expect(A.store.prog[5]).toEqual(B.store.prog[5]);
    expect(A.store.prog[5]).toMatchObject({ s: 0, wrong: 1 });
  });

  it('兩台各自練不同的題：合併後兩邊都有全部', async () => {
    const { A, B } = await world();
    A.answer(1, true);
    B.answer(2, true);
    await A.sync.fullSync();
    await B.sync.fullSync();
    await A.sync.fullSync();
    expect(Object.keys(A.store.prog).sort()).toEqual(['1', '2']);
    expect(A.store.prog).toEqual(B.store.prog);
  });

  it('離線時作答會累積，恢復連線後補傳', async () => {
    const { A, B, net } = await world();
    net.a = false;
    A.answer(1, true);
    A.answer(1, true);
    A.answer(9, false);
    await A.sync.pushDirty();
    expect(A.sync.getState()).toMatchObject({ status: 'offline', pending: 3 }); // 2 題 + 1 天
    expect(A.store.dirtyProg.size).toBe(2);

    net.a = true;
    await A.sync.fullSync();
    expect(A.sync.getState()).toMatchObject({ status: 'synced', pending: 0 });

    await B.sync.fullSync();
    expect(B.store.prog[1].s).toBe(2);
    expect(B.store.prog[9].s).toBe(0);
  });

  it('待上傳清單存在本機：離線關掉再打開，恢復連線後仍會補傳', async () => {
    const cloud = new MemoryKV();
    const disk = new MemoryKV();
    let online = false;
    const be = new MockBackend(cloud, () => online);
    online = true;
    await be.signUp('a@example.com', 'password-1234');
    const uid = (await be.getUser())!.id;
    online = false;

    const first = new LocalStore(disk, uid);
    first.recordAnswer(3, applyStudyAnswer(undefined, true, 500));

    const reopened = new LocalStore(disk, uid); // 模擬重新開啟網頁
    expect([...reopened.dirtyProg]).toEqual([3]);
    online = true;
    const sync = new SyncEngine(reopened, be, { debounceMs: 0, now: () => 1, isOnline: () => online });
    await sync.pushDirty();
    expect((await be.pullProgress()).map((r) => r.qno)).toEqual([3]);
  });

  it('模擬考紀錄取聯集，不會重複', async () => {
    const { A, B } = await world();
    const attempt = (id: string, at: number): Attempt => ({ id, at, total: 50, wrong: 3, seconds: 600, passed: true, wrongQnos: [1, 2, 3] });
    A.store.addAttempt(attempt('a1', 10));
    B.store.addAttempt(attempt('b1', 20));
    await A.sync.fullSync();
    await B.sync.fullSync();
    await A.sync.fullSync();
    await A.sync.fullSync();
    expect(A.store.attempts.map((x) => x.id)).toEqual(['a1', 'b1']);
    expect(B.store.attempts.map((x) => x.id)).toEqual(['a1', 'b1']);
  });

  it('每日題數同步後取較大值', async () => {
    const { A, B } = await world();
    A.answer(1, true);
    A.answer(2, true);
    A.answer(3, true);
    B.answer(4, true);
    await A.sync.fullSync();
    await B.sync.fullSync();
    const day = Object.keys(A.store.activity)[0];
    expect(B.store.activity[day]).toBe(3);
  });

  it('上傳途中又答了同一題：這題仍留在待上傳清單，下次再送', async () => {
    const cloud = new MemoryKV();
    const real = new MockBackend(cloud, () => true);
    await real.signUp('race@example.com', 'password-1234');
    const store = new LocalStore(new MemoryKV(), (await real.getUser())!.id);

    // 讓第一次上傳「卡在半路」，直到測試放行。
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const slow: typeof real = Object.create(real);
    slow.pushProgress = async (rows) => {
      if (calls++ === 0) await gate;
      return real.pushProgress(rows);
    };
    const sync = new SyncEngine(store, slow, { debounceMs: 0, now: () => 1, isOnline: () => true });

    store.recordAnswer(1, applyStudyAnswer(undefined, true, 100));
    const pushing = sync.pushDirty();
    await Promise.resolve();
    await Promise.resolve(); // 讓上傳開始並卡在 gate
    store.recordAnswer(1, applyStudyAnswer(store.prog[1], true, 200)); // 上傳途中又作答
    release();
    await pushing;

    expect(store.dirtyProg.has(1)).toBe(true); // 送出去的是舊值，所以還不能算送達
    await sync.pushDirty();
    expect(store.dirtyProg.has(1)).toBe(false);
    expect((await real.pullProgress())[0]).toMatchObject({ qno: 1, score: 2, updated_at: 200 });
  });

  it('不同帳號的資料互不相通', async () => {
    const cloud = new MemoryKV();
    const be = new MockBackend(cloud, () => true);
    await be.signUp('one@example.com', 'password-1234');
    await be.pushProgress([{ qno: 1, score: 2, seen: 2, wrong: 0, updated_at: 5 }]);
    await be.signOut();
    await be.signUp('two@example.com', 'password-1234');
    expect(await be.pullProgress()).toEqual([]);
  });
});

describe('本機儲存', () => {
  it('資料損毀時從空白開始，不會丟出錯誤', () => {
    const kv = new MemoryKV();
    kv.setItem('dt:v1:guest', '{壞掉的 JSON');
    const store = new LocalStore(kv, 'guest');
    expect(store.isEmpty).toBe(true);
  });

  it('不同擁有者的資料分開存放', () => {
    const kv = new MemoryKV();
    const guest = new LocalStore(kv, 'guest');
    guest.recordAnswer(1, applyStudyAnswer(undefined, true, 1));
    expect(new LocalStore(kv, 'user-1').isEmpty).toBe(true);
    expect(new LocalStore(kv, 'guest').prog[1].s).toBe(1);
  });
});
