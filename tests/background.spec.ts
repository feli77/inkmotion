import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN', colorScheme: 'light' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
});

test('starts with transparent, black and white swatches and shows chosen backgrounds in both themes', async ({ page }) => {
  const palette = page.locator('#background-palette');
  const svg = page.locator('#drawing > svg');
  await expect(page.locator('select#background')).toHaveCount(0);
  expect(await palette.locator('.swatch').evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.color)))
    .toEqual(['transparent', '#000000', '#ffffff']);
  await expect(palette.getByRole('button', { name: '透明', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#background-value')).toHaveValue('透明');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(svg).toHaveCSS('background-image', 'none');
    await expect(svg).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(svg.locator(':scope > rect')).toHaveCount(0);
    for (const color of ['#000000', '#ffffff']) {
      await palette.locator(`[data-color="${color}"]`).click();
      await expect(svg.locator(':scope > rect')).toBeVisible();
      await expect(svg.locator(':scope > rect')).toHaveAttribute('fill', color);
      await page.locator('#theme-toggle').click();
      await expect(svg.locator(':scope > rect')).toBeVisible();
      await expect(svg.locator(':scope > rect')).toHaveAttribute('fill', color);
      await page.locator('#theme-toggle').click();
    }
    await palette.getByRole('button', { name: '透明', exact: true }).click();
    await expect(svg.locator(':scope > rect')).toHaveCount(0);
  }
});

test('saves committed background colors separately from stroke colors and restores them after reload', async ({ page }) => {
  const swatches = page.locator('#background-palette .swatch');
  const picker = page.getByLabel('自定义背景颜色', { exact: true });
  for (const color of ['#123456', '#58caa1']) {
    await picker.evaluate((input: HTMLInputElement, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, color);
    await expect(page.locator('#drawing > svg > rect')).toHaveAttribute('fill', color);
    await expect(swatches).toHaveCount(3);
  }
  await picker.dispatchEvent('change');
  await picker.dispatchEvent('change');
  await expect(swatches).toHaveCount(4);
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await expect(page.locator('#color-value')).toHaveValue('#171717');
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#171717');
  await page.reload();
  await expect(page.locator('#background-value')).toHaveValue('#58CAA1');
  await expect(page.locator('#background-palette [data-color="#58caa1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#background-palette [data-color="#123456"]')).toHaveCount(0);
  await expect(page.locator('#drawing > svg > rect')).toHaveAttribute('fill', '#58caa1');
});

test('normalizes hex backgrounds, rejects invalid colors and commits without interrupting swatch clicks', async ({ page }) => {
  const hex = page.getByRole('textbox', { name: '十六进制背景颜色' });
  const swatches = page.locator('#background-palette .swatch');
  await hex.fill('#aBc');
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await hex.press('Enter');
  await expect(hex).toHaveValue('#AABBCC');
  await expect(page.locator('#background')).toHaveValue('#aabbcc');
  await expect(swatches).toHaveCount(4);
  for (const value of ['AABBCC', '#12', '#GG1234', '#12345678', '']) {
    await hex.fill(value);
    await hex.press('Tab');
    await expect(hex).toHaveValue('#AABBCC');
    await expect(swatches).toHaveCount(4);
  }
  await hex.fill('#243042');
  await page.locator('#background-palette [data-color="#ffffff"]').click();
  await expect(hex).toHaveValue('#FFFFFF');
  await expect(page.locator('#background-palette [data-color="#243042"]')).toHaveCount(1);
  await expect(page.locator('#drawing > svg > rect')).toHaveAttribute('fill', '#ffffff');
  await hex.fill('transparent');
  await hex.press('Enter');
  await expect(hex).toHaveValue('透明');
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await hex.fill('#12');
  await hex.press('Escape');
  await hex.press('Tab');
  await expect(hex).toHaveValue('透明');
  await expect(swatches).toHaveCount(5);
});

test('protects transparency from pointer and keyboard holds even when all other background swatches are deleted', async ({ page }) => {
  const transparent = page.locator('#background-palette [data-color="transparent"]');
  await transparent.scrollIntoViewIfNeeded();
  await transparent.hover();
  await page.mouse.down();
  await page.waitForTimeout(1450);
  await expect(transparent).not.toHaveClass(/is-deleting/);
  await page.mouse.up();
  await transparent.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(1450);
  await expect(transparent).not.toHaveClass(/is-deleting/);
  await page.keyboard.up('Space');
  await expect(transparent).toHaveAttribute('aria-pressed', 'true');
  for (const color of ['#000000', '#ffffff']) {
    const button = page.locator(`#background-palette [data-color="${color}"]`);
    await button.focus();
    await page.keyboard.down('Space');
    await expect(button).toHaveCount(0);
    await page.keyboard.up('Space');
  }
  await expect(page.locator('#background-palette .swatch')).toHaveCount(1);
  await expect(transparent).toBeFocused();
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('#background-palette .swatch')).toHaveCount(1);
  await expect(transparent).toHaveAttribute('aria-pressed', 'true');
});

test('validates saved backgrounds and always restores the protected transparent option', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('inkmotion.background-palette.v1', JSON.stringify([
      'transparent', '#AABBCC', '#aabbcc', '<img src=x>', 'url(https://example.com)', null, 123,
    ]));
    localStorage.setItem('inkmotion.draft.v1', JSON.stringify({ settings: { background: '#AABBCC' } }));
  });
  await page.reload();
  await expect(page.locator('#background-palette .swatch')).toHaveCount(2);
  await expect(page.locator('#background-value')).toHaveValue('#AABBCC');
  await expect(page.locator('#drawing > svg > rect')).toHaveAttribute('fill', '#aabbcc');
  await expect(page.locator('#background-palette img')).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem('inkmotion.background-palette.v1', '{broken');
    localStorage.setItem('inkmotion.draft.v1', JSON.stringify({ settings: { background: 'url(https://example.com)' } }));
  });
  await page.reload();
  await expect(page.locator('#background-palette .swatch')).toHaveCount(3);
  await expect(page.locator('#background-value')).toHaveValue('透明');
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
});

test('keeps background selection, saving and deletion working without storage', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.reload();
  await page.locator('#background').fill('#123456');
  const saved = page.locator('#background-palette [data-color="#123456"]');
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await saved.focus();
  await page.keyboard.down('Space');
  await expect(saved).toHaveCount(0);
  await page.keyboard.up('Space');
  await expect(page.locator('#drawing > svg > rect')).toHaveAttribute('fill', '#123456');
  await page.locator('#background-palette [data-color="transparent"]').click();
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await expect(page.locator('#export')).toBeEnabled();
});

test('translates background controls and transparency without changing the selection', async ({ page }) => {
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Background palette', exact: true })).toBeVisible();
  await expect(page.getByLabel('Custom background color', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Hex background color' })).toHaveValue('Transparent');
  const transparent = page.getByRole('button', { name: 'Transparent', exact: true });
  await expect(transparent).toHaveAttribute('aria-pressed', 'true');
  await expect(transparent).toHaveAttribute('title', 'Transparent');
  await page.locator('#background').fill('#123456');
  await expect(page.locator('#background-palette [data-color="#123456"]')).toHaveAttribute('title', 'Hold to remove color');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.locator('#background-value')).toHaveValue('#123456');
  await expect(page.locator('#background-palette [data-color="#123456"]')).toHaveAccessibleName('背景 #123456');
});

for (const width of [1440, 900, 375, 320]) {
  test(`background colors wrap beside stroke colors at ${width}px in both themes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const color of ['#fef3c7', '#dbeafe', '#dcfce7', '#ffe4e6', '#e0e7ff', '#f3e8ff']) {
      await page.locator('#background').fill(color);
    }
    await page.locator('#palette [data-color="#ff677d"]').click();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('#theme-toggle').click();
      await page.locator('#background-palette [data-color="transparent"]').click();
      await expect(page.locator('#export')).toBeEnabled();
      await page.mouse.move(0, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const group = (await page.locator('.appearance-group').boundingBox())!;
      for (const control of await page.locator('.appearance-group input, .appearance-group button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(group.x);
        expect(box.x + box.width).toBeLessThanOrEqual(group.x + group.width);
      }
      await page.screenshot({ path: testInfo.outputPath(`${theme}-transparent.png`), fullPage: true });
      await page.locator('#background-palette [data-color="#dbeafe"]').click();
      await expect(page.locator('#export')).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-color.png`), fullPage: true });
    }
  });
}
