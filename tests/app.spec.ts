import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
});

test('editing updates preview, settings, playback and SVG downloads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#text').fill('Hello, InkMotion!\nWrite it slowly.');
  await expect(page.locator('#drawing title')).toHaveText('Hello, InkMotion!\nWrite it slowly.');
  await page.locator('#progress').dispatchEvent('pointerdown');
  await page.locator('#progress').fill('1');
  await expect(page.locator('#progress')).toHaveValue('1');
  await expect(page.locator('#play')).toHaveAccessibleName('播放');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAccessibleName('暂停');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAccessibleName('播放');
  await page.locator('#progress').fill('0.6');
  await expect(page.locator('#progress')).toHaveValue('0.6');
  await page.locator('#replay').click();
  await expect(page.locator('#play')).toHaveAccessibleName('暂停');
  await page.locator('#speed').fill('2');
  await page.locator('#strokeWidth').fill('3');
  await page.locator('[data-color="#263b61"]').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#263b61');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('inkmotion-animated.svg');
  const stream = await download.createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  expect(data).toContain('<animate');
  expect(data).toContain('Hello, InkMotion!');
  expect(data).not.toContain('<script');
  await page.locator('#export-mode').selectOption('static');
  const staticEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const staticDownload = await staticEvent;
  const staticStream = await staticDownload.createReadStream();
  let staticData = '';
  for await (const chunk of staticStream!) staticData += chunk.toString();
  expect(staticData).not.toContain('<animate');
  expect(errors).toEqual([]);
});

test('empty and unsupported input prevent exporting; draft survives reload', async ({ page }) => {
  await page.locator('#text').fill('Hello 你好');
  await expect(page.locator('#warning')).toContainText('暂不支持');
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#text').fill('');
  await expect(page.locator('#empty')).toContainText('写点什么');
  await expect(page.locator('#play')).toBeDisabled();
  await page.locator('#text').fill('A saved thought.');
  await expect(page.locator('#export')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#text')).toHaveValue('A saved thought.');
  await expect(page.locator('#drawing title')).toHaveText('A saved thought.');
});

test('mobile has no horizontal overflow and transparent export preserves the background choice', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('summary').click();
  await page.locator('#background').selectOption('transparent');
  await page.locator('#alignment').selectOption('center');
  await page.locator('#loop').check();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await expect(page.locator('#drawing animate').first()).toHaveAttribute('repeatCount', 'indefinite');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#progress').fill('1');
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('reduced motion shows completed text and retains manual playback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#play')).toHaveAccessibleName('播放');
  await expect(page.locator('#progress')).toHaveValue('1');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAccessibleName('暂停');
});

test('a failed font request can be retried', async ({ page }) => {
  await page.route('**/fonts/satisfy.json', route => route.fulfill({ status: 503, body: '' }));
  await page.reload();
  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#export')).toBeDisabled();
  await page.unroute('**/fonts/satisfy.json');
  await page.locator('#retry').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#retry')).toBeHidden();
});
