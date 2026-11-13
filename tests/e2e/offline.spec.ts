import { expect, test } from '@playwright/test';
import { answerStudy } from './helpers';

test('開過一次之後，沒有網路也能重新整理、背題、看圖', async ({ page, context }) => {
  await page.goto('/');
  // 等 service worker 接手，且題目附圖都已放進快取。
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dt:img-cached:v1')), { timeout: 20_000 }).toBe('1');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('汽車駕照筆試練習');

  await page.goto('/#/study?scope=img&go=1');
  const img = page.locator('img.qimg');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await answerStudy(page, true);

  await page.reload();
  await page.goto('/#/');
  await expect(page.getByTestId('mastered')).toBeVisible();
});
