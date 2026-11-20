import { expect, test, type Page } from '@playwright/test';
import { answerOf } from './helpers';

async function examQnos(page: Page): Promise<number[]> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('dt:exam')!).qnos as number[]);
}

test.describe('模擬考', () => {
  test('全部答對得 100 分並記錄到統計', async ({ page }) => {
    await page.goto('/#/exam');
    await page.getByRole('button', { name: '開始作答' }).click();
    const qnos = await examQnos(page);
    expect(qnos).toHaveLength(50);
    expect(new Set(qnos).size).toBe(50);

    for (let i = 0; i < qnos.length; i++) {
      await page.locator(`input[name="ans"][value="${answerOf(qnos[i])}"]`).check();
      if (i < qnos.length - 1) await page.getByRole('button', { name: '下一題' }).click();
    }
    await expect(page.getByTestId('answered')).toHaveText('50');

    await page.getByRole('button', { name: '交卷', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('全部作答完畢');
    await page.getByRole('button', { name: '確定交卷' }).click();

    await expect(page.getByTestId('score')).toContainText('100');
    await expect(page.getByTestId('verdict')).toHaveText('及格');

    await page.goto('/#/stats');
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr').first()).toContainText('及格');
  });

  test('交卷前不顯示對錯；重新整理可以接續；沒作答的題算錯', async ({ page }) => {
    await page.goto('/#/exam');
    await page.getByRole('button', { name: '開始作答' }).click();
    const qnos = await examQnos(page);

    await page.locator(`input[name="ans"][value="${answerOf(qnos[0])}"]`).check();
    await expect(page.locator('.opt.ok, .opt.bad, .mark')).toHaveCount(0);
    await page.getByRole('button', { name: '標記待檢查' }).click();

    await page.reload();
    await expect(page.getByTestId('answered')).toHaveText('1');
    await expect(page.getByRole('button', { name: '取消標記' })).toBeVisible();

    await page.getByRole('button', { name: '交卷', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('還有 49 題沒作答');
    await expect(page.getByRole('alertdialog')).toContainText('有 1 題標記待檢查');
    await page.getByRole('button', { name: '確定交卷' }).click();

    await expect(page.getByTestId('score')).toContainText('2');
    await expect(page.getByTestId('verdict')).toHaveText('不及格');
    await expect(page.locator('article.review.wrong')).toHaveCount(49);

    await page.goto('/#/wrong');
    await expect(page.locator('main')).toContainText('答錯過 49 題');
  });

  test('時間到會自動交卷', async ({ page }) => {
    await page.goto('/#/exam');
    await page.getByRole('button', { name: '開始作答' }).click();
    await expect(page.getByTestId('clock')).toHaveText(/^(30:00|29:5\d)$/);
    // 把結束時間改成 1 秒後，模擬時間快到。
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem('dt:exam')!);
      s.endsAt = Date.now() + 1000;
      sessionStorage.setItem('dt:exam', JSON.stringify(s));
    });
    await page.reload();
    await expect(page.getByTestId('verdict')).toHaveText('不及格', { timeout: 5000 });
    await expect(page.locator('.result')).toContainText('時間到，已自動交卷');
  });

  test('鍵盤：選完答案後用方向鍵和 Enter 換題，不會改到答案', async ({ page }) => {
    await page.goto('/#/exam');
    await page.getByRole('button', { name: '開始作答' }).click();
    const cur = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('dt:exam')!).cur as number);

    // 點選項後焦點留在 radio 上，這正是方向鍵原本會改答案的情況。
    await page.locator('input[name="ans"][value="2"]').check();
    await expect(page.locator('input[name="ans"][value="2"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect.poll(cur).toBe(1);
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect.poll(cur).toBe(2);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(cur).toBe(0);
    await expect(page.locator('input[name="ans"][value="2"]')).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(cur).toBe(0);
    await expect(page.getByTestId('answered')).toHaveText('2');
  });
});
