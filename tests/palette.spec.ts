import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ locale: 'zh-CN' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
});

async function pressSwatch(page: Page, button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function removeSwatch(page: Page, button: Locator): Promise<void> {
  await pressSwatch(page, button);
  await expect(button).toHaveCount(0);
  await page.mouse.up();
}

async function ringOffset(button: Locator): Promise<number> {
  return button.locator('.swatch-progress').evaluate(ring => Number.parseFloat(getComputedStyle(ring).strokeDashoffset));
}

test('saves only the committed picker color, deduplicates it and restores it after reload', async ({ page }) => {
  const swatches = page.locator('#palette .swatch');
  const picker = page.locator('#color');
  await expect(page.locator('#save-color, #edit-palette, .swatch-remove')).toHaveCount(0);
  for (const color of ['#123456', '#234567', '#58caa1']) {
    await picker.evaluate((input: HTMLInputElement, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, color);
    await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', color);
    await expect(swatches).toHaveCount(5);
  }
  const drawing = (await page.locator('#drawing > svg').elementHandle())!;
  await picker.dispatchEvent('change');
  await expect(swatches).toHaveCount(6);
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  await expect(page.locator('#palette .swatch[data-color="#58caa1"]')).toHaveAttribute('aria-pressed', 'true');
  await picker.dispatchEvent('change');
  await expect(swatches).toHaveCount(6);
  await page.reload();
  await expect(swatches).toHaveCount(6);
  await expect(page.locator('#color-value')).toHaveValue('#58CAA1');
  await expect(page.locator('#palette .swatch[data-color="#123456"]')).toHaveCount(0);
});

test('commits typed hex colors without interrupting a click on another swatch', async ({ page }) => {
  const hex = page.locator('#color-value');
  await hex.fill('#aBc');
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await hex.press('Enter');
  await expect(page.locator('#palette .swatch[data-color="#aabbcc"]')).toHaveAttribute('aria-pressed', 'true');
  await hex.fill('AABBCC');
  await hex.press('Tab');
  await expect(page.locator('#palette .swatch')).toHaveCount(6);
  await hex.fill('#12');
  await hex.press('Tab');
  await expect(page.locator('#palette .swatch')).toHaveCount(6);
  await hex.fill('#243042');
  await page.locator('#palette .swatch[data-color="#a8e6cf"]').click();
  await expect(hex).toHaveValue('#A8E6CF');
  await expect(page.locator('#palette .swatch[data-color="#243042"]')).toHaveCount(1);
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#a8e6cf');
});

test('scales on hover, returns to original size on press and rebounds on release', async ({ page }) => {
  const button = page.locator('#palette .swatch').first();
  const scale = () => button.evaluate(element => Number.parseFloat(getComputedStyle(element).transform.split('(')[1]));
  await button.hover();
  await expect.poll(scale).toBeGreaterThan(1.1);
  await page.mouse.down();
  await expect.poll(scale, { intervals: [20] }).toBeCloseTo(1, 2);
  await expect(button).not.toHaveClass(/is-deleting/);
  await page.mouse.up();
  await expect(button).toHaveClass(/is-rebounding/);
  await expect.poll(scale, { intervals: [16] }).toBeGreaterThan(1.15);
  await expect(button).not.toHaveClass(/is-rebounding/);
  await expect.poll(scale).toBeCloseTo(1.12, 2);
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
});

test('shows a centered cross and clockwise inner ring, then smoothly reverses an unfinished hold', async ({ page }) => {
  const button = page.locator('#palette .swatch').first();
  await pressSwatch(page, button);
  await expect(button).toHaveClass(/is-deleting/);
  await expect(button.locator('.swatch-delete')).toHaveCSS('opacity', '1');
  await expect.poll(() => ringOffset(button), { intervals: [30] }).toBeLessThan(.65);
  const before = await ringOffset(button);
  const circleBox = (await button.boundingBox())!;
  const crossBox = (await button.locator('.swatch-delete > svg').first().boundingBox())!;
  expect(crossBox.x + crossBox.width / 2).toBeCloseTo(circleBox.x + circleBox.width / 2, 1);
  expect(crossBox.y + crossBox.height / 2).toBeCloseTo(circleBox.y + circleBox.height / 2, 1);
  const ringBox = (await button.locator('.swatch-ring').boundingBox())!;
  expect(ringBox.width).toBeLessThan(circleBox.width);
  await page.mouse.up();
  await expect.poll(() => ringOffset(button), { intervals: [16] }).toBeGreaterThan(before + .05);
  expect(await ringOffset(button)).toBeLessThan(1);
  await expect.poll(() => ringOffset(button)).toBe(1);
  await expect(button).not.toHaveClass(/is-deleting/);
  await page.waitForTimeout(1050);
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await expect(page.locator('#color-value')).toHaveValue('#171717');
});

test('deletes on a completed hold, suppresses the release click and preserves an empty palette', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inkmotion.palette.v1', JSON.stringify(['#a8e6cf', '#dcedc1'])));
  await page.reload();
  const first = page.locator('#palette .swatch[data-color="#a8e6cf"]');
  await first.click();
  await expect(page.locator('#export')).toBeEnabled();
  const drawing = (await page.locator('#drawing > svg').elementHandle())!;
  await removeSwatch(page, first);
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
  await expect(page.locator('#palette .swatch')).toHaveCount(1);
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  await page.reload();
  await expect(page.locator('#palette .swatch')).toHaveCount(1);
  await removeSwatch(page, page.locator('#palette .swatch'));
  await expect(page.locator('#color')).toBeFocused();
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
  await page.reload();
  await expect(page.locator('#palette .swatch')).toHaveCount(0);
  const hex = page.locator('#color-value');
  await hex.focus();
  await hex.press('Tab');
  await expect(page.locator('#palette .swatch')).toHaveCount(0);
  await hex.fill('#12');
  await hex.press('Escape');
  await hex.press('Tab');
  await expect(page.locator('#palette .swatch')).toHaveCount(0);
  await page.locator('#color').fill('#123456');
  await expect(page.locator('#palette .swatch')).toHaveCount(1);
});

test('cancels deletion when dragged off, interrupted or moved into the background', async ({ page }) => {
  const button = page.locator('#palette .swatch').first();
  for (const reason of ['move', 'cancel', 'blur']) {
    await pressSwatch(page, button);
    await expect(button).toHaveClass(/is-deleting/);
    if (reason === 'move') {
      const bounds = (await button.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width + 30, bounds.y + bounds.height / 2);
    } else if (reason === 'cancel') {
      await button.dispatchEvent('pointercancel', { pointerId: 1 });
    } else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    await expect(button).not.toHaveClass(/is-pressed|is-deleting/);
  }
  await page.waitForTimeout(1050);
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await expect(page.locator('#color-value')).toHaveValue('#171717');
  await page.locator('#palette .swatch').last().click();
  await expect(page.locator('#color-value')).toHaveValue('#FF677D');
});

test('supports the same short press and hold behavior from the keyboard', async ({ page }) => {
  const button = page.locator('#palette .swatch[data-color="#a8e6cf"]');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
  await page.keyboard.down('Space');
  await expect(button).toHaveClass(/is-deleting/);
  await page.keyboard.up('Space');
  await expect(button).not.toHaveClass(/is-deleting/);
  await expect(button).toHaveCount(1);
  await page.keyboard.down('Space');
  await expect(button).toHaveCount(0);
  await page.keyboard.up('Space');
  await expect(page.locator('#palette .swatch').first()).toBeFocused();
  await expect(page.locator('#color-value')).toHaveValue('#A8E6CF');
});

test('validates saved palettes and recovers from malformed storage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('inkmotion.palette.v1', JSON.stringify([
    '#AABBCC', '#aabbcc', '#243042', 'url(https://example.com)', '<img src=x>', null, 123,
  ])));
  await page.reload();
  await expect(page.locator('#palette .swatch')).toHaveCount(2);
  await expect(page.locator('#palette .swatch').first()).toHaveAttribute('data-color', '#aabbcc');
  await expect(page.locator('#palette .swatch').last()).toHaveAttribute('data-color', '#243042');
  await expect(page.locator('#palette img')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('inkmotion.palette.v1', '{broken'));
  await page.reload();
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await expect(page.locator('#export')).toBeEnabled();
});

test('auto-save and hold deletion still work when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.reload();
  await page.locator('#color').fill('#123456');
  await expect(page.locator('#palette .swatch')).toHaveCount(6);
  await expect(page.locator('#export')).toBeEnabled();
  await removeSwatch(page, page.locator('#palette .swatch[data-color="#123456"]'));
  await expect(page.locator('#palette .swatch')).toHaveCount(5);
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#123456');
});

test('translates the hold hint without losing saved colors', async ({ page }) => {
  await page.locator('#color').fill('#123456');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Color palette', exact: true })).toBeVisible();
  await expect(page.locator('#palette .swatch[data-color="#123456"]')).toHaveAttribute('title', 'Hold to remove color');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.locator('#palette .swatch[data-color="#123456"]')).toHaveAttribute('title', '长按删除颜色');
});

for (const width of [1440, 900, 375, 320]) {
  test(`saved colors wrap and show hold feedback at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: width === 375 ? 'dark' : 'light' });
    for (const color of ['#171717', '#123456', '#234567', '#345678', '#456789', '#56789a', '#6789ab']) {
      await page.locator('#color').fill(color);
    }
    const swatches = page.locator('#palette .swatch');
    await expect(swatches).toHaveCount(12);
    const first = (await swatches.first().boundingBox())!;
    const last = (await swatches.last().boundingBox())!;
    expect(last.y).toBeGreaterThan(first.y);
    await page.locator('#color-field').screenshot({ path: testInfo.outputPath('palette.png') });
    await pressSwatch(page, swatches.last());
    await expect.poll(() => ringOffset(swatches.last()), { intervals: [30] }).toBeLessThan(.6);
    await page.locator('#color-field').screenshot({ path: testInfo.outputPath('palette-holding.png') });
    await page.mouse.up();
    await expect(swatches.last()).not.toHaveClass(/is-deleting/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await removeSwatch(page, page.locator('#palette .swatch[data-color="#6789ab"]'));
    await page.reload();
    await expect(swatches).toHaveCount(11);
  });
}

test.describe('touch input', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test('supports touch hold deletion and cancels a scrolling gesture', async ({ page }) => {
    const button = page.locator('#palette .swatch[data-color="#a8e6cf"]');
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(button).toHaveClass(/is-deleting/);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y - 50 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(button).not.toHaveClass(/is-pressed|is-deleting/);
    await expect(page.locator('#palette .swatch')).toHaveCount(5);
    await button.scrollIntoViewIfNeeded();
    const nextBox = (await button.boundingBox())!;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nextBox.x + nextBox.width / 2, y: nextBox.y + nextBox.height / 2 }] });
    await expect(button).toHaveCount(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#color-value')).toHaveValue('#171717');
    await expect(page.locator('#palette .swatch')).toHaveCount(4);
  });
});
