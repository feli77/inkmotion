import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
});

test('saves hex and picker colors without duplicates and restores the palette after reload', async ({ page }) => {
  const swatches = page.locator('.swatch');
  const save = page.locator('#save-color');
  await expect(swatches).toHaveCount(5);
  await page.locator('#color-value').fill('#aBc');
  await save.click();
  const saved = page.locator('.swatch[data-color="#aabbcc"]');
  await expect(saved).toBeFocused();
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#aabbcc');
  await expect(save).toBeDisabled();
  await expect(save).toHaveText('已在色板');
  await expect(swatches).toHaveCount(6);
  await page.locator('#color-value').fill('AABBCC');
  await expect(save).toBeDisabled();
  await page.locator('#color-value').fill('#12');
  await expect(save).toBeDisabled();
  await page.locator('#color-value').press('Escape');
  await expect(save).toBeDisabled();

  await page.locator('#color').fill('#58caa1');
  await expect(page.locator('#export')).toBeEnabled();
  const drawing = (await page.locator('#drawing > svg').elementHandle())!;
  await save.click();
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  await expect(swatches).toHaveCount(7);
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(swatches).toHaveCount(7);
  await expect(page.locator('#color-value')).toHaveValue('#58CAA1');
  await expect(page.locator('.swatch[data-color="#58caa1"]')).toHaveAttribute('aria-pressed', 'true');
  await saved.click();
  await expect(page.locator('#color-value')).toHaveValue('#AABBCC');
  await expect(page.locator('#color')).toHaveValue('#aabbcc');
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#aabbcc');
});

test('removes any swatch without changing the drawing and preserves an empty palette', async ({ page }) => {
  await page.locator('.swatch[data-color="#a8e6cf"]').click();
  await expect(page.locator('#export')).toBeEnabled();
  const drawing = (await page.locator('#drawing > svg').elementHandle())!;
  await page.getByRole('button', { name: '编辑色板', exact: true }).click();
  await page.getByRole('button', { name: '删除颜色 #A8E6CF', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.swatch[data-color="#a8e6cf"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除颜色 #DCEDC1', exact: true })).toBeFocused();
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
  await expect(page.locator('#color')).toHaveValue('#a8e6cf');
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  await expect(page.locator('#save-color')).toBeEnabled();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.swatch-remove')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.swatch')).toHaveCount(4);
  await expect(page.locator('.swatch[data-color="#a8e6cf"]')).toHaveCount(0);

  await page.locator('#edit-palette').click();
  for (let remaining = 4; remaining > 0; remaining--) {
    await page.locator('.swatch-remove').first().click();
    await expect(page.locator('.swatch')).toHaveCount(remaining - 1);
  }
  await expect(page.locator('#save-color')).toBeFocused();
  await expect(page.locator('#edit-palette')).toBeDisabled();
  await expect(page.locator('#edit-palette')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('.swatch')).toHaveCount(0);
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
  await page.locator('#save-color').click();
  await expect(page.locator('.swatch')).toHaveCount(1);
  await expect(page.locator('.swatch')).toHaveAttribute('data-color', '#a8e6cf');
});

test('validates saved palettes and recovers from malformed storage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inkmotion.palette.v1', JSON.stringify([
    '#AABBCC', '#aabbcc', '#243042', 'url(https://example.com)', '<img src=x>', null, 123,
  ])));
  await page.reload();
  await expect(page.locator('.swatch')).toHaveCount(2);
  await expect(page.locator('.swatch').first()).toHaveAttribute('data-color', '#aabbcc');
  await expect(page.locator('.swatch').last()).toHaveAttribute('data-color', '#243042');
  await expect(page.locator('#palette img')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('inkmotion.palette.v1', '{broken'));
  await page.reload();
  await expect(page.locator('.swatch')).toHaveCount(5);
  await expect(page.locator('#export')).toBeEnabled();
});

test('palette editing still works when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.reload();
  await page.locator('#color-value').fill('#123456');
  await page.locator('#save-color').click();
  await expect(page.locator('.swatch')).toHaveCount(6);
  await page.locator('#edit-palette').click();
  await page.locator('[data-remove-color="#123456"]').click();
  await expect(page.locator('.swatch')).toHaveCount(5);
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#123456');
  await expect(page.locator('#export')).toBeEnabled();
});

test('translates palette actions and delete labels while keeping saved colors and edit mode', async ({ page }) => {
  await page.locator('#save-color').click();
  await page.locator('#edit-palette').click();
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Color palette', exact: true })).toBeVisible();
  await expect(page.locator('#save-color')).toHaveText('Color saved');
  await expect(page.locator('#edit-palette')).toHaveText('Done');
  await expect(page.getByRole('button', { name: 'Remove color #171717', exact: true })).toBeVisible();
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('button', { name: '删除颜色 #171717', exact: true })).toBeVisible();
  await expect(page.locator('#save-color')).toHaveText('已在色板');
  await page.locator('#edit-palette').click();
  await expect(page.locator('#edit-palette')).toHaveText('编辑色板');
});

for (const width of [1440, 900, 375, 320]) {
  test(`saved colors wrap and remain selectable and removable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const color of ['#171717', '#123456', '#234567', '#345678', '#456789', '#56789a', '#6789ab']) {
      await page.locator('#color-value').fill(color);
      await page.locator('#save-color').click();
    }
    const swatches = page.locator('.swatch');
    await expect(swatches).toHaveCount(12);
    const first = (await swatches.first().boundingBox())!;
    const last = (await swatches.last().boundingBox())!;
    expect(last.y).toBeGreaterThan(first.y);
    await swatches.first().click();
    await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
    await expect(page.locator('#export')).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('palette.png'), fullPage: true });
    await page.locator('#edit-palette').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const group = (await page.locator('.appearance-group').boundingBox())!;
    for (const button of await page.locator('.color-field button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(group.x);
      expect(box.x + box.width).toBeLessThanOrEqual(group.x + group.width);
    }
    await page.screenshot({ path: testInfo.outputPath('palette-editing.png'), fullPage: true });
    await page.locator('[data-remove-color="#6789ab"]').click();
    await expect(swatches).toHaveCount(11);
    await page.locator('#edit-palette').click();
    await page.reload();
    await expect(swatches).toHaveCount(11);
  });
}
