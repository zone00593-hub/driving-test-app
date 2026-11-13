import { expect, test } from '@playwright/test';
import { answerOf, answerStudy, answerText, currentQno } from './helpers';

test.describe('訪客背題', () => {
  test('不登入就能背題：答錯會再出現，答對兩次算已熟，重新整理後進度還在', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('汽車駕照筆試練習');
    await expect(page.getByTestId('mastered')).toHaveText('0');

    await page.getByRole('link', { name: '開始背題' }).click();
    expect(await currentQno(page)).toBe(1);

    // 第 1 題故意答錯 → 隔 4 題後再出現。
    await answerStudy(page, false);
    for (let i = 0; i < 4; i++) await answerStudy(page, true);
    expect(await currentQno(page)).toBe(1);

    // 連續答對兩次（中間隔 12 題）→ 已熟。
    await answerStudy(page, true);
    for (let i = 0; i < 12; i++) await answerStudy(page, true);
    expect(await currentQno(page)).toBe(1);
    await page.locator(`[data-pick="${answerOf(1)}"]`).click();
    await expect(page.locator('.feedback')).toContainText('已熟');

    await page.goto('/#/');
    await expect(page.getByTestId('mastered')).not.toHaveText('0');
    const mastered = await page.getByTestId('mastered').innerText();

    await page.reload();
    await expect(page.getByTestId('mastered')).toHaveText(mastered);

    // 答錯過的題進了錯題本，並標示已克服。
    await page.goto('/#/wrong');
    await page.getByRole('button', { name: /全部/ }).click();
    await expect(page.locator('article.review').first()).toContainText('題庫 #1');
    await expect(page.locator('article.review').first()).toContainText('已克服');
  });

  test('可以只用鍵盤作答：按數字鍵選答案，按 Enter 到下一題', async ({ page }) => {
    await page.goto('/#/study?go=1');
    const first = await currentQno(page);
    await page.keyboard.press(String(answerOf(first)));
    await expect(page.locator('.feedback')).toContainText('答對了');
    await expect(page.getByRole('button', { name: '下一題' })).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await currentQno(page)).not.toBe(first);
  });

  test('看圖題會顯示圖片，選項文字可以打亂而正解仍然正確', async ({ page }) => {
    await page.goto('/#/study');
    await page.getByLabel('範圍').selectOption('img');
    await page.getByLabel(/打亂選項順序/).check();
    await page.getByRole('button', { name: '開始' }).click();
    const img = page.locator('img.qimg');
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: '不知道，直接看答案' }).click();
    // 選項順序被打亂了，但被標為正解的那個選項，文字必須等於題庫裡正解的文字。
    const n = await currentQno(page);
    await expect(page.locator('.opt.ok')).toHaveCount(1);
    await expect(page.locator('.opt.ok')).toContainText(answerText(n));
  });

  test('手機寬度不會出現橫向捲動', async ({ page }) => {
    for (const path of ['/#/', '/#/study?go=1', '/#/exam', '/#/stats', '/#/wrong', '/#/account', '/#/about']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeAttached();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
