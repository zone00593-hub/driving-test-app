import { expect, test } from '@playwright/test';
import { answerStudy, cloudProgress, exportCloud, signIn, signUp } from './helpers';

const email = (tag: string) => `${tag}-${Date.now()}@example.com`;

test.describe('帳號與同步（假後端）', () => {
  test('註冊後作答會上傳；第二台裝置登入後看到同一份進度', async ({ page, browser }) => {
    const me = email('sync');
    await signUp(page, me);

    await page.goto('/#/study?go=1');
    const n1 = await answerStudy(page, true);
    const n2 = await answerStudy(page, false);

    await expect.poll(async () => Object.keys(await cloudProgress(page)).length).toBe(2);
    const cloud = await cloudProgress(page);
    expect(cloud[n1].score).toBe(1);
    expect(cloud[n2].score).toBe(0);

    // 第二台裝置：全新的瀏覽器環境，只有「雲端」相同。
    const snapshot = await exportCloud(page);
    const other = await browser.newContext();
    await other.addInitScript((data) => {
      if (!localStorage.getItem('mock:accounts')) for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }, snapshot);
    const phone = await other.newPage();
    await signIn(phone, me);
    await phone.goto('/#/');
    await expect(phone.getByTestId('weak')).toHaveText('1');
    await phone.goto('/#/wrong');
    await expect(phone.locator('article.review').first()).toContainText(`題庫 #${n2}`);
    await other.close();
  });

  test('離線時照常作答，恢復連線後自動補傳', async ({ page, context }) => {
    await signUp(page, email('offline'));
    await page.goto('/#/study?go=1');
    await answerStudy(page, true);
    await expect.poll(async () => Object.keys(await cloudProgress(page)).length).toBe(1);

    await context.setOffline(true);
    await answerStudy(page, true);
    await answerStudy(page, true);
    await expect(page.locator('.chip')).toContainText('待上傳');
    expect(Object.keys(await cloudProgress(page)).length).toBe(1);

    await context.setOffline(false);
    await expect.poll(async () => Object.keys(await cloudProgress(page)).length, { timeout: 10_000 }).toBe(3);
    await expect(page.locator('.chip')).toHaveText('已同步');
  });

  test('訪客進度可以在登入後併入帳號', async ({ page }) => {
    await page.goto('/#/study?go=1');
    const n = await answerStudy(page, true);

    await signUp(page, email('merge'));
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: '這台裝置有登入前的練習進度' })).toBeVisible();
    await page.getByRole('button', { name: '併入帳號' }).click();
    await expect(page.getByRole('heading', { name: '這台裝置有登入前的練習進度' })).toHaveCount(0);
    await expect.poll(async () => Object.keys(await cloudProgress(page))).toEqual([String(n)]);
  });

  test('登出後這台裝置不留下帳號的進度；刪除帳號會清掉雲端資料', async ({ page }) => {
    const me = email('delete');
    await signUp(page, me);
    await page.goto('/#/study?go=1');
    await answerStudy(page, false);
    await expect.poll(async () => Object.keys(await cloudProgress(page)).length).toBe(1);

    await page.goto('/#/account');
    await page.getByRole('button', { name: '登出' }).click();
    await expect(page.locator('form[data-form="auth"] button[type="submit"]')).toHaveText('登入');
    await page.goto('/#/');
    await expect(page.getByTestId('weak')).toHaveText('0');

    await signIn(page, me);
    await page.goto('/#/');
    await expect(page.getByTestId('weak')).toHaveText('1'); // 進度從雲端回來

    await page.goto('/#/account');
    await page.getByRole('button', { name: '刪除帳號與所有資料' }).click();
    await page.getByLabel('請輸入你的 Email 確認刪除').fill('wrong@example.com');
    await page.getByRole('button', { name: '永久刪除帳號' }).click();
    await expect(page.getByRole('alert')).toContainText('不一致');
    await page.getByRole('button', { name: '刪除帳號與所有資料' }).or(page.getByLabel('請輸入你的 Email 確認刪除')).first().waitFor();
    await page.getByLabel('請輸入你的 Email 確認刪除').fill(me);
    await page.getByRole('button', { name: '永久刪除帳號' }).click();
    await expect(page.getByRole('alert')).toContainText('已刪除');

    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mock:data:')));
    expect(left).toEqual([]);
  });

  test('密碼錯誤會顯示看得懂的訊息', async ({ page }) => {
    const me = email('wrongpw');
    await signUp(page, me);
    await page.getByRole('button', { name: '登出' }).click();
    await page.getByLabel('Email').fill(me);
    await page.getByLabel(/密碼/).fill('not-the-password');
    await page.locator('form[data-form="auth"] button[type="submit"]').click();
    await expect(page.getByRole('alert')).toHaveText('帳號或密碼不正確。');
  });
});
