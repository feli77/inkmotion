import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN', colorScheme: 'light' });

test('follows system theme changes until a manual choice is saved and restores it after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const root = page.locator('html');
  const toggle = page.getByRole('button', { name: '切换为浅色主题' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await expect(toggle.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17191c');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f5f5');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await toggle.click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-toggle')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('inkmotion.theme.v1'))).toBe('light');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.locator('#theme-toggle').press('Enter');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});

test('ignores an invalid saved theme and keeps switching usable when storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('inkmotion.theme.v1', 'invalid');
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#text').fill('Still works');
  await expect(page.locator('#drawing title')).toHaveText('Still works');
  await expect(page.locator('#export')).toBeEnabled();
});

test('translates the theme action and tooltip when the language or theme changes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#theme-toggle');
  await expect(toggle).toHaveAccessibleName('切换为深色主题');
  await expect(toggle).toHaveAttribute('title', '切换为深色主题');
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('切换为浅色主题');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(toggle).toHaveAccessibleName('Switch to light theme');
  await expect(toggle).toHaveAttribute('title', 'Switch to light theme');
  await toggle.press('Space');
  await expect(toggle).toHaveAccessibleName('Switch to dark theme');
  await expect(toggle).toHaveAttribute('title', 'Switch to dark theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('keeps dark previews readable without changing artwork, playback, draft settings or exports', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#text').fill('Keep these colors');
  await page.locator('#color-value').fill('#123456');
  await expect(page.locator('#export')).toBeEnabled();
  const svg = page.locator('#drawing > svg');
  const drawing = (await svg.elementHandle())!;
  const artwork = await svg.innerHTML();
  const time = await svg.evaluate((element: SVGSVGElement) => element.getCurrentTime());
  const draft = await page.evaluate(() => localStorage.getItem('inkmotion.draft.v1'));
  await expect(svg.locator(':scope > rect')).toBeHidden();
  await page.locator('#theme-toggle').click();
  await expect(svg.locator(':scope > rect')).toBeVisible();
  await expect(svg.locator(':scope > rect')).toHaveAttribute('fill', '#ffffff');
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  expect(await svg.innerHTML()).toBe(artwork);
  expect(await svg.evaluate((element: SVGSVGElement) => element.getCurrentTime())).toBeCloseTo(time, 3);
  expect(await page.evaluate(() => localStorage.getItem('inkmotion.draft.v1'))).toBe(draft);
  await expect(page.locator('#text')).toHaveValue('Keep these colors');
  await expect(page.locator('#color-value')).toHaveValue('#123456');
  await expect(page.locator('#background')).toHaveValue('#ffffff');

  for (const background of ['#ffffff', 'transparent']) {
    await page.locator('#background').selectOption(background);
    await expect(page.locator('#export')).toBeEnabled();
    await expect(svg.locator(':scope > g')).toHaveAttribute('stroke', '#123456');
    if (background === 'transparent') {
      await expect(svg.locator(':scope > rect')).toHaveCount(0);
      await expect(svg).toHaveCSS('background-image', /repeating-conic-gradient/);
    }
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#export').click();
    const stream = await (await downloadEvent).createReadStream();
    let data = '';
    for await (const chunk of stream!) data += chunk.toString();
    expect(data).toContain('stroke="#123456"');
    expect(data.includes('<rect')).toBe(background === '#ffffff');
    expect(data).not.toContain('repeating-conic-gradient');
    expect(data).not.toContain('data-theme');
  }
});

for (const width of [1440, 768, 375, 320]) {
  test(`theme and language controls fit beside each other in both themes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const toggle = (await page.locator('#theme-toggle').boundingBox())!;
      const language = (await page.locator('#language-toggle').boundingBox())!;
      const brand = (await page.locator('.brand').boundingBox())!;
      expect(toggle.y).toBeCloseTo(language.y, 1);
      expect(toggle.x).toBeGreaterThan(brand.x + brand.width);
      expect(toggle.x + toggle.width).toBeLessThan(language.x);
      expect(language.x + language.width).toBeLessThanOrEqual(width);
      await page.locator('#language-toggle').click();
      await expect(page.getByRole('menuitemradio', { name: '简体中文', exact: true })).toBeFocused();
      const menu = (await page.locator('#language-menu').boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${theme}.png`), fullPage: true });
      await page.keyboard.press('Escape');
    }
  });
}
