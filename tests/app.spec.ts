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
  const drawing = page.locator('#drawing > svg');
  await drawing.evaluate((svg: SVGSVGElement) => {
    svg.pauseAnimations();
    svg.setCurrentTime(2);
  });
  await page.locator('#replay').click();
  expect(await drawing.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  expect(await drawing.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBeLessThan(1);
  await expect.poll(() => drawing.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBeGreaterThan(0.05);
  await page.locator('#speed').fill('2');
  await page.locator('#strokeWidth').fill('3');
  await page.locator('[data-color="#ff677d"]').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#ff677d');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('inkmotion-animated.svg');
  const stream = await download.createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  expect(data).toContain('<animate');
  expect(data).toContain('Hello, InkMotion!');
  expect(data).toContain('stroke="#ff677d"');
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
  await expect(page.locator('#replay')).toBeDisabled();
  await page.locator('#text').fill('A saved thought.');
  await expect(page.locator('#export')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#text')).toHaveValue('A saved thought.');
  await expect(page.locator('#drawing title')).toHaveText('A saved thought.');
});

test('hex color editing updates the picker, preview, saved draft and SVG export', async ({ page }) => {
  const hexInput = page.getByRole('textbox', { name: '十六进制笔画颜色' });
  const picker = page.getByLabel('自定义笔画颜色', { exact: true });
  const ink = page.locator('#drawing > svg > g');
  await expect(hexInput).toHaveValue('#171717');
  await hexInput.fill('#1a2B3c');
  await expect(ink).toHaveAttribute('stroke', '#1a2b3c');
  await expect(picker).toHaveValue('#1a2b3c');
  await hexInput.press('Tab');
  await expect(hexInput).toHaveValue('#1A2B3C');

  await hexInput.fill('');
  await hexInput.pressSequentially('aBc123');
  await expect(hexInput).toHaveValue('aBc123');
  await expect(ink).toHaveAttribute('stroke', '#abc123');
  await hexInput.press('Enter');
  await expect(hexInput).toHaveValue('#ABC123');
  await page.reload();
  await expect(hexInput).toHaveValue('#ABC123');
  await expect(picker).toHaveValue('#abc123');
  await expect(ink).toHaveAttribute('stroke', '#abc123');
  await expect(page.locator('#export')).toBeEnabled();

  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  expect(data).toContain('stroke="#abc123"');
});

test('hex editing accepts shorthand, preserves valid colors and stays in sync with color controls', async ({ page }) => {
  const hexInput = page.locator('#color-value');
  const picker = page.locator('#color');
  const ink = page.locator('#drawing > svg > g');
  await hexInput.fill(' #aBc ');
  await expect(ink).toHaveAttribute('stroke', '#171717');
  await hexInput.press('Enter');
  await expect(hexInput).toHaveValue('#AABBCC');
  await expect(picker).toHaveValue('#aabbcc');
  await expect(ink).toHaveAttribute('stroke', '#aabbcc');
  await hexInput.fill('f6A');
  await hexInput.press('Tab');
  await expect(hexInput).toHaveValue('#FF66AA');
  await expect(ink).toHaveAttribute('stroke', '#ff66aa');

  for (const invalid of ['#12', '#GG1234', '#12345678', '']) {
    await hexInput.fill(invalid);
    await expect(ink).toHaveAttribute('stroke', '#ff66aa');
    await hexInput.press('Tab');
    await expect(hexInput).toHaveValue('#FF66AA');
    await expect(picker).toHaveValue('#ff66aa');
  }
  await hexInput.fill('#12');
  await hexInput.press('Escape');
  await expect(hexInput).toHaveValue('#FF66AA');
  await page.reload();
  await expect(hexInput).toHaveValue('#FF66AA');
  await expect(ink).toHaveAttribute('stroke', '#ff66aa');

  const swatch = page.locator('[data-color="#ff677d"]');
  await swatch.click();
  await expect(hexInput).toHaveValue('#FF677D');
  await expect(picker).toHaveValue('#ff677d');
  await expect(swatch).toHaveAttribute('aria-pressed', 'true');
  await picker.fill('#243042');
  await expect(hexInput).toHaveValue('#243042');
  await expect(ink).toHaveAttribute('stroke', '#243042');
  await expect(page.locator('.swatch[aria-pressed="true"]')).toHaveCount(0);
  await hexInput.fill('FF677D');
  await expect(swatch).toHaveAttribute('aria-pressed', 'true');
});

test('mobile has no horizontal overflow and transparent export preserves the background choice', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#lineHeight').fill('2');
  await expect(page.locator('#lineHeight-value')).toHaveText('2.0×');
  await page.locator('#background').selectOption('transparent');
  await page.locator('#alignment').selectOption('center');
  await page.locator('#loop').check();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await expect(page.locator('#drawing animate').first()).toHaveAttribute('repeatCount', 'indefinite');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

for (const width of [1440, 900, 375, 320]) {
  test(`settings stay above the full-width preview at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('#export')).toBeEnabled();
    const editor = page.locator('.editor');
    const preview = page.locator('.preview-panel');

    await expect(editor.locator('details, summary')).toHaveCount(0);
    for (const id of ['lineHeight', 'alignment', 'background', 'loop', 'color-value']) {
      await expect(editor.locator(`#${id}`)).toBeVisible();
    }
    const colorCircleBox = (await editor.locator('.custom-color > span').boundingBox())!;
    const colorPlusBox = (await editor.locator('.custom-color path').boundingBox())!;
    expect(colorPlusBox.x + colorPlusBox.width / 2).toBeCloseTo(colorCircleBox.x + colorCircleBox.width / 2, 1);
    expect(colorPlusBox.y + colorPlusBox.height / 2).toBeCloseTo(colorCircleBox.y + colorCircleBox.height / 2, 1);
    const editorBox = (await editor.boundingBox())!;
    const previewBox = (await preview.boundingBox())!;
    expect(previewBox.y).toBeGreaterThan(editorBox.y + editorBox.height);
    expect(previewBox.x).toBeCloseTo(editorBox.x, 1);
    expect(previewBox.width).toBeCloseTo(editorBox.width, 1);
    await expect(page.locator('#status')).toBeEmpty();
    await expect(preview.locator('#play, #progress, #time, .transport')).toHaveCount(0);
    const replay = page.locator('#replay');
    await expect(replay).toHaveAccessibleName('重新播放');
    await expect(replay).toBeEnabled();
    const paperBox = (await page.locator('#paper').boundingBox())!;
    const paperArea = page.locator('.paper-area');
    const paperAreaBox = (await paperArea.boundingBox())!;
    expect(paperAreaBox.x).toBeCloseTo(previewBox.x + 1, 1);
    expect(paperAreaBox.width).toBeCloseTo(previewBox.width - 2, 1);
    expect(paperBox.x).toBeCloseTo(paperAreaBox.x, 1);
    expect(paperBox.y).toBeCloseTo(paperAreaBox.y, 1);
    expect(paperBox.width).toBeCloseTo(await paperArea.evaluate(element => element.clientWidth), 1);
    expect(paperBox.height).toBeGreaterThanOrEqual(paperAreaBox.height);
    const replayBox = (await replay.boundingBox())!;
    const drawingBox = (await page.locator('#drawing').boundingBox())!;
    expect(replayBox.x + replayBox.width).toBeCloseTo(paperBox.x + paperBox.width - 12, 1);
    expect(replayBox.y).toBeCloseTo(paperBox.y + 12, 1);
    expect(replayBox.y + replayBox.height).toBeLessThanOrEqual(drawingBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const control of await editor.locator('textarea, input:visible, select:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(editorBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
    }
    for (const group of await editor.locator('.settings-group').all()) {
      const groupBox = (await group.boundingBox())!;
      for (const control of await group.locator('input, select, button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(groupBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(groupBox.x + groupBox.width);
      }
    }

    await page.screenshot({ path: testInfo.outputPath('layout.png'), fullPage: true });
  });
}

test('reduced motion shows completed text and retains manual playback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  const drawing = page.locator('#drawing > svg');
  expect(await drawing.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  expect(await drawing.evaluate(svg => Number.parseFloat(getComputedStyle(svg.querySelector('path:last-child')!).strokeDashoffset))).toBeCloseTo(0, 3);
  await page.locator('#replay').click();
  expect(await drawing.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  expect(await drawing.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBeLessThan(1);
  await expect.poll(() => drawing.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBeGreaterThan(0.05);
});

test('a failed font request can be retried', async ({ page }) => {
  await page.route('**/fonts/satisfy.json', route => route.fulfill({ status: 503, body: '' }));
  await page.reload();
  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#replay')).toBeDisabled();
  await page.unroute('**/fonts/satisfy.json');
  await page.locator('#retry').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#retry')).toBeHidden();
});
