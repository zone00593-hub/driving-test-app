import type { KV } from '../store/local';
import { NoneBackend, type Backend } from './types';

/**
 * 依環境變數決定後端：
 * - VITE_BACKEND=mock            → 假後端（自動化測試、本機示範）
 * - 有 VITE_SUPABASE_URL 與 KEY  → Supabase
 * - 都沒有                        → 只有訪客模式
 * 用動態載入，沒用到的後端不會被下載。
 */
export async function createBackend(kv: KV): Promise<Backend> {
  const env = import.meta.env;
  if (env.VITE_BACKEND === 'mock') {
    const { MockBackend } = await import('./mock');
    return new MockBackend(kv);
  }
  const url = env.VITE_SUPABASE_URL as string | undefined;
  const key = env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key && !url.includes('你的專案代號')) {
    try {
      const { SupabaseBackend } = await import('./supabase');
      return new SupabaseBackend(url, key);
    } catch (e) {
      console.error('無法載入雲端後端，改用訪客模式。', e);
    }
  }
  return new NoneBackend();
}
