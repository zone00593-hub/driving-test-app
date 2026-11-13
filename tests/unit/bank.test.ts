import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BANK } from '../../src/core/bank';

/** 題庫資料的完整性檢查：資料檔被改壞時，CI 會擋下來。 */
describe('題庫資料', () => {
  it('共 1090 題，題號 1 到 1090 連續不重複', () => {
    expect(BANK).toHaveLength(1090);
    expect(BANK.map((q) => q.n)).toEqual(Array.from({ length: 1090 }, (_v, i) => i + 1));
  });

  it('每題都有三個選項，正解是 1、2 或 3', () => {
    for (const q of BANK) {
      expect(q.o, `#${q.n}`).toHaveLength(3);
      expect([1, 2, 3], `#${q.n}`).toContain(q.a);
    }
  });

  it('架構分類與題號範圍一致', () => {
    for (const q of BANK) expect(q.c, `#${q.n}`).toBe(q.n <= 424 ? 1 : q.n <= 654 ? 2 : 3);
  });

  it('文字題的三個選項都有內容；選項是圖片的題一定有附圖', () => {
    for (const q of BANK) {
      if (q.full) expect(q.img, `#${q.n}`).toBeTruthy();
      else for (const o of q.o) expect(o.trim().length, `#${q.n}`).toBeGreaterThan(0);
    }
  });

  it('沒有題幹的題一定有附圖', () => {
    for (const q of BANK) if (!q.q.trim()) expect(q.img, `#${q.n}`).toBeTruthy();
  });

  it('所有附圖檔案都存在', () => {
    const withImg = BANK.filter((q) => q.img);
    expect(withImg).toHaveLength(192);
    for (const q of withImg) expect(existsSync(resolve(process.cwd(), 'public', q.img!)), q.img).toBe(true);
  });
});
