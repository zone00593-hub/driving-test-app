import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Activity, Attempt } from '../types';
import { BackendError, type Backend, type ProgRow, type User } from './types';

const PAGE = 1000; // PostgREST 預設一次最多回傳 1000 列，題庫有 1090 題，所以要分頁。
const CHUNK = 500;

/** 把 Supabase 的英文錯誤轉成使用者看得懂的中文。 */
function friendly(e: unknown): BackendError {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.toLowerCase();
  let zh = '發生錯誤，請稍後再試。';
  if (m.includes('invalid login credentials')) zh = '帳號或密碼不正確。';
  else if (m.includes('already registered') || m.includes('already been registered')) zh = '這個 Email 已經註冊過了，請直接登入。';
  else if (m.includes('email not confirmed')) zh = '這個 Email 還沒完成驗證，請先點信件裡的連結。';
  else if (m.includes('password should be') || m.includes('weak password')) zh = '密碼太短或太簡單，請至少 8 個字元。';
  else if (m.includes('rate limit') || m.includes('too many')) zh = '操作太頻繁，請過幾分鐘再試。';
  else if (m.includes('failed to fetch') || m.includes('network')) zh = '連不上伺服器，請檢查網路。';
  else if (m.includes('invalid email') || m.includes('unable to validate email')) zh = 'Email 格式不正確。';
  else if (m.includes('same password') || m.includes('different from the old')) zh = '新密碼不能和舊密碼相同。';
  return new BackendError(zh, e);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  readonly available = true;
  private client: SupabaseClient;
  private recoveryCbs = new Set<() => void>();

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      // 用 PKCE：驗證信與重設密碼連結會帶 ?code=，不會和本站的 #/ 路由衝突。
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') this.recoveryCbs.forEach((cb) => cb());
    });
  }

  private redirectUrl() {
    return location.origin + location.pathname;
  }

  private async uid(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new BackendError('登入已過期，請重新登入。');
    return id;
  }

  async getUser(): Promise<User | null> {
    const { data } = await this.client.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  onAuthChange(cb: (user: User | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      // 依 Supabase 建議，不在這個回呼裡直接呼叫其他 auth 方法；延後到下一輪事件迴圈。
      setTimeout(() => cb(u ? { id: u.id, email: u.email ?? '' } : null), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  onPasswordRecovery(cb: () => void) {
    this.recoveryCbs.add(cb);
    return () => this.recoveryCbs.delete(cb);
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: this.redirectUrl() },
    });
    if (error) throw friendly(error);
    return { needsEmailConfirm: !data.session };
  }

  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw friendly(error);
  }

  async signOut() {
    // scope: 'local' 只登出這台裝置，不影響其他裝置。
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw friendly(error);
  }

  async sendPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: this.redirectUrl() });
    if (error) throw friendly(error);
  }

  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw friendly(error);
  }

  async deleteAccount() {
    // 由資料庫函式刪除 auth.users 中自己的那一列，其餘資料靠外鍵 cascade 一併刪除。
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw friendly(error);
    await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  async pullProgress(): Promise<ProgRow[]> {
    const rows: ProgRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from('progress')
        .select('qno,score,seen,wrong,updated_at')
        .order('qno')
        .range(from, from + PAGE - 1);
      if (error) throw friendly(error);
      for (const r of data ?? []) {
        rows.push({ qno: r.qno, score: r.score, seen: r.seen, wrong: r.wrong, updated_at: Date.parse(r.updated_at) });
      }
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  async pushProgress(rows: ProgRow[]) {
    if (!rows.length) return;
    const user_id = await this.uid();
    for (const part of chunks(rows, CHUNK)) {
      const payload = part.map((r) => ({ ...r, user_id, updated_at: new Date(r.updated_at).toISOString() }));
      // 資料庫的 trigger 會拒絕比現有資料舊的更新，所以晚到的舊資料不會蓋掉新資料。
      const { error } = await this.client.from('progress').upsert(payload, { onConflict: 'user_id,qno' });
      if (error) throw friendly(error);
    }
  }

  async pullAttempts(): Promise<Attempt[]> {
    const { data, error } = await this.client
      .from('exam_attempts')
      .select('id,created_at,total,wrong,seconds,passed,wrong_qnos')
      .order('created_at')
      .limit(PAGE);
    if (error) throw friendly(error);
    return (data ?? []).map((r) => ({
      id: r.id,
      at: Date.parse(r.created_at),
      total: r.total,
      wrong: r.wrong,
      seconds: r.seconds,
      passed: r.passed,
      wrongQnos: r.wrong_qnos ?? [],
    }));
  }

  async pushAttempts(attempts: Attempt[]) {
    if (!attempts.length) return;
    const user_id = await this.uid();
    const payload = attempts.map((a) => ({
      id: a.id,
      user_id,
      created_at: new Date(a.at).toISOString(),
      total: a.total,
      wrong: a.wrong,
      seconds: a.seconds,
      passed: a.passed,
      wrong_qnos: a.wrongQnos,
    }));
    const { error } = await this.client.from('exam_attempts').upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw friendly(error);
  }

  async pullActivity(): Promise<Activity> {
    const { data, error } = await this.client.from('activity').select('day,answered').order('day', { ascending: false }).limit(PAGE);
    if (error) throw friendly(error);
    const out: Activity = {};
    for (const r of data ?? []) out[r.day] = r.answered;
    return out;
  }

  async pushActivity(days: Activity) {
    const entries = Object.entries(days);
    if (!entries.length) return;
    const user_id = await this.uid();
    const payload = entries.map(([day, answered]) => ({ user_id, day, answered }));
    const { error } = await this.client.from('activity').upsert(payload, { onConflict: 'user_id,day' });
    if (error) throw friendly(error);
  }
}
