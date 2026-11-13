import type { KV } from '../store/local';
import type { Activity, Attempt } from '../types';
import { BackendError, type Backend, type ProgRow, type User } from './types';

interface Account {
  id: string;
  password: string;
}
interface Data {
  progress: Record<number, ProgRow>;
  attempts: Attempt[];
  activity: Activity;
}

/**
 * 測試用的假後端：帳號與「雲端」資料都放在同一個鍵值儲存的 mock:* 鍵底下，
 * 行為刻意模仿正式後端——離線時丟錯、較舊的進度不會蓋掉較新的、每日題數取較大值。
 * 只用於自動化測試與本機示範，密碼是明碼存放，不可用於正式環境。
 */
export class MockBackend implements Backend {
  readonly kind = 'mock' as const;
  readonly available = true;
  private authCbs = new Set<(u: User | null) => void>();

  constructor(
    private kv: KV,
    private isOnline: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  ) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.kv.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private write(key: string, value: unknown) {
    this.kv.setItem(key, JSON.stringify(value));
  }
  private net() {
    if (!this.isOnline()) throw new BackendError('連不上伺服器，請檢查網路。');
  }
  private accounts() {
    return this.read<Record<string, Account>>('mock:accounts', {});
  }
  private session(): User | null {
    return this.read<User | null>('mock:session', null);
  }
  private requireUser(): User {
    const u = this.session();
    if (!u) throw new BackendError('登入已過期，請重新登入。');
    return u;
  }
  private data(uid: string): Data {
    return this.read<Data>(`mock:data:${uid}`, { progress: {}, attempts: [], activity: {} });
  }
  private setSession(u: User | null) {
    if (u) this.write('mock:session', u);
    else this.kv.removeItem('mock:session');
    this.authCbs.forEach((cb) => cb(u));
  }

  async getUser() {
    return this.session();
  }
  onAuthChange(cb: (u: User | null) => void) {
    this.authCbs.add(cb);
    return () => this.authCbs.delete(cb);
  }
  onPasswordRecovery() {
    return () => {};
  }

  async signUp(email: string, password: string) {
    this.net();
    const key = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(key)) throw new BackendError('Email 格式不正確。');
    if (password.length < 8) throw new BackendError('密碼太短或太簡單，請至少 8 個字元。');
    const all = this.accounts();
    if (all[key]) throw new BackendError('這個 Email 已經註冊過了，請直接登入。');
    const id = `mock-${Object.keys(all).length + 1}-${key.replace(/[^a-z0-9]/g, '')}`;
    all[key] = { id, password };
    this.write('mock:accounts', all);
    this.setSession({ id, email: key });
    return { needsEmailConfirm: false };
  }

  async signIn(email: string, password: string) {
    this.net();
    const key = email.trim().toLowerCase();
    const acct = this.accounts()[key];
    if (!acct || acct.password !== password) throw new BackendError('帳號或密碼不正確。');
    this.setSession({ id: acct.id, email: key });
  }

  /** 模擬 Google 登入：直接以一個固定的 Google 帳號登入（第一次會自動建立）。 */
  async signInWithGoogle() {
    this.net();
    const key = 'google.user@example.com';
    const all = this.accounts();
    if (!all[key]) {
      all[key] = { id: `mock-google-${Object.keys(all).length + 1}`, password: '' };
      this.write('mock:accounts', all);
    }
    this.setSession({ id: all[key].id, email: key });
  }

  async signOut() {
    this.setSession(null);
  }
  async sendPasswordReset() {
    this.net();
  }
  async updatePassword(password: string) {
    this.net();
    const u = this.requireUser();
    const all = this.accounts();
    all[u.email].password = password;
    this.write('mock:accounts', all);
  }

  async deleteAccount() {
    this.net();
    const u = this.requireUser();
    const all = this.accounts();
    delete all[u.email];
    this.write('mock:accounts', all);
    this.kv.removeItem(`mock:data:${u.id}`);
    this.setSession(null);
  }

  async pullProgress() {
    this.net();
    return Object.values(this.data(this.requireUser().id).progress);
  }
  async pushProgress(rows: ProgRow[]) {
    this.net();
    const u = this.requireUser();
    const d = this.data(u.id);
    for (const r of rows) {
      const old = d.progress[r.qno];
      if (!old || r.updated_at >= old.updated_at) d.progress[r.qno] = r; // 與資料庫 trigger 相同的規則
    }
    this.write(`mock:data:${u.id}`, d);
  }

  async pullAttempts() {
    this.net();
    return this.data(this.requireUser().id).attempts;
  }
  async pushAttempts(attempts: Attempt[]) {
    this.net();
    const u = this.requireUser();
    const d = this.data(u.id);
    const have = new Set(d.attempts.map((a) => a.id));
    for (const a of attempts) if (!have.has(a.id)) d.attempts.push(a);
    this.write(`mock:data:${u.id}`, d);
  }

  async pullActivity() {
    this.net();
    return this.data(this.requireUser().id).activity;
  }
  async pushActivity(days: Activity) {
    this.net();
    const u = this.requireUser();
    const d = this.data(u.id);
    for (const [day, n] of Object.entries(days)) d.activity[day] = Math.max(d.activity[day] ?? 0, n);
    this.write(`mock:data:${u.id}`, d);
  }
}
