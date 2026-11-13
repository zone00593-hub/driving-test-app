import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Q {
  n: number;
  a: 1 | 2 | 3;
  o: [string, string, string];
}
// 測試從專案根目錄執行，所以用 process.cwd() 找題庫檔。
const bank = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/bank.json'), 'utf8')) as Q[];
/** 題庫裡這一題正解的文字。 */
export const answerText = (n: number) => {
  const q = bank.find((x) => x.n === n)!;
  return q.o[q.a - 1];
};
export const answerOf = (n: number) => bank.find((q) => q.n === n)!.a;
export const wrongOf = (n: number) => (answerOf(n) === 1 ? 2 : 1);

/** 目前背題卡片上的題庫題號。 */
export async function currentQno(page: Page): Promise<number> {
  const text = await page.locator('.qmeta .mono').innerText();
  return Number(text.replace(/\D/g, ''));
}

/** 在背題模式回答目前這一題（答對或故意答錯），然後按下一題。 */
export async function answerStudy(page: Page, correct: boolean): Promise<number> {
  const n = await currentQno(page);
  await page.locator(`[data-pick="${correct ? answerOf(n) : wrongOf(n)}"]`).click();
  await expect(page.locator('.feedback')).toContainText(correct ? '答對了' : '答錯了');
  await page.getByRole('button', { name: '下一題' }).click();
  return n;
}

export async function signUp(page: Page, email: string, password = 'password-1234') {
  await page.goto('/#/account');
  await page.getByRole('button', { name: '註冊' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/密碼/).fill(password);
  await page.getByRole('button', { name: '建立帳號' }).click();
  await expect(page.getByTestId('email')).toHaveText(email);
}

export async function signIn(page: Page, email: string, password = 'password-1234') {
  await page.goto('/#/account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/密碼/).fill(password);
  await page.locator('form[data-form="auth"] button[type="submit"]').click();
  await expect(page.getByTestId('email')).toHaveText(email);
}

/** 假後端把「雲端」放在 localStorage 的 mock:* 鍵；這裡讀出某個帳號在雲端的進度。 */
export async function cloudProgress(page: Page): Promise<Record<string, { score: number }>> {
  return page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('mock:session') || 'null');
    if (!session) return {};
    return JSON.parse(localStorage.getItem(`mock:data:${session.id}`) || '{"progress":{}}').progress;
  });
}

/** 把假雲端（帳號與資料）複製出來，用來在另一個瀏覽器環境模擬「第二台裝置」。 */
export async function exportCloud(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('mock:') && k !== 'mock:session') out[k] = localStorage.getItem(k)!;
    }
    return out;
  });
}
