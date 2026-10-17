import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

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
  expect(data).not.toContain('<rect');
  expect(data).not.toContain('<script');
  const staticEvent = page.waitForEvent('download');
  await page.locator('#export-static').click();
  const staticDownload = await staticEvent;
  const staticStream = await staticDownload.createReadStream();
  let staticData = '';
  for await (const chunk of staticStream!) staticData += chunk.toString();
  expect(staticData).not.toContain('<animate');
  expect(errors).toEqual([]);
});

test('empty and unsupported input prevent exporting; draft survives reload', async ({ page }) => {
  await page.locator('#text').fill('Hello 你好');
  await expect(page.locator('#warning')).toContainText('不支持以下字符');
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeDisabled();
  await page.locator('#text').fill('');
  await expect(page.locator('#empty')).toContainText('写点什么');
  await expect(page.locator('#replay')).toBeDisabled();
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeDisabled();
  await page.locator('#text').fill('A saved thought.');
  await expect(page.locator('#export')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#text')).toHaveValue('A saved thought.');
  await expect(page.locator('#drawing title')).toHaveText('A saved thought.');
});

test('erase settings enable looping once and preserve independent holds and manual loop changes', async ({ page }) => {
  await expect(page.locator('#erase')).not.toBeChecked();
  await expect(page.locator('#erase-settings')).toBeHidden();
  await expect(page.locator('#loop')).not.toBeChecked();
  await page.locator('#erase').check();
  await expect(page.locator('#loop')).toBeChecked();
  await expect(page.locator('#holdDuration-value')).toHaveValue('1');
  await expect(page.locator('#blankDuration-value')).toHaveValue('1');
  await page.getByRole('spinbutton', { name: '写完停留', exact: true }).fill('1.8');
  await page.getByRole('spinbutton', { name: '空白停留', exact: true }).fill('0.4');
  await expect(page.locator('#blankDuration-value')).toHaveValue('0.4');
  await page.locator('#loop').uncheck();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing [repeatCount]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#erase')).toBeChecked();
  await expect(page.locator('#loop')).not.toBeChecked();
  await expect(page.locator('#holdDuration-value')).toHaveValue('1.8');
  await expect(page.locator('#blankDuration-value')).toHaveValue('0.4');
  await page.locator('#erase').uncheck();
  await expect(page.locator('#erase-settings')).toBeHidden();
  await expect(page.locator('#loop')).not.toBeChecked();
  await page.locator('#erase').check();
  await expect(page.locator('#loop')).toBeChecked();
  await expect(page.locator('#holdDuration-value')).toHaveValue('1.8');
});

test('compact hold inputs accept zero, normalize values and keep keyboard editing available', async ({ page }) => {
  await page.locator('#erase').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#erase-settings')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#holdDuration-value')).toBeFocused();
  for (const key of ['holdDuration', 'blankDuration']) {
    const input = page.locator(`#${key}-value`);
    await input.fill('');
    await input.press('Tab');
    await expect(input).toHaveValue('1');
    await input.fill('-1');
    await input.press('Enter');
    await expect(input).toHaveValue('0');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('0.1');
    await input.fill('31');
    await input.press('Enter');
    await expect(input).toHaveValue('30');
    await input.fill('1.37');
    await input.press('Enter');
    await expect(input).toHaveValue('1.4');
    await input.fill('0');
  }
  await page.locator('#blankDuration-value').press('Tab');
  await expect(page.locator('#export')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#holdDuration-value')).toHaveValue('0');
  await expect(page.locator('#blankDuration-value')).toHaveValue('0');
  await page.locator('#erase').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.locator('#color-value')).toBeFocused();
});

for (const width of [1440, 768, 601, 375, 320]) {
  test(`erase controls fit at ${width}px and reduced motion holds completed text`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#text').fill('Hello');
    await page.locator('#erase').check();
    await expect(page.locator('#export')).toBeEnabled();
    for (const key of ['holdDuration', 'blankDuration']) {
      await expect(page.locator(`#${key}-value`)).toBeVisible();
    }
    const hold = (await page.locator('#holdDuration-value').boundingBox())!;
    const blank = (await page.locator('#blankDuration-value').boundingBox())!;
    expect(hold.y).toBeCloseTo(blank.y, 1);
    expect(hold.x + hold.width).toBeLessThan(blank.x);
    for (const option of await page.locator('.playback-options .checkbox-label').all()) {
      expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const drawing = page.locator('#drawing > svg');
    expect(await drawing.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
    expect(await drawing.evaluate(svg => Number.parseFloat(getComputedStyle(svg.querySelector('path:last-child')!).strokeDashoffset))).toBeCloseTo(0, 3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('erase-settings.png'), fullPage: true });
    await page.locator('#replay').click();
    expect(await drawing.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
  });
}

for (const format of ['png', 'gif']) {
  test(`${format.toUpperCase()} downloads without showing a success message`, async ({ page }, testInfo) => {
    await page.locator('#text').fill('Hi');
    await page.locator('#speed').fill('3');
    await expect(page.locator(`#export-${format}`)).toBeEnabled();
    const downloadEvent = page.waitForEvent('download');
    await page.locator(`#export-${format}`).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`inkmotion-${format === 'png' ? 'static' : 'animated'}.${format}`);
    await download.saveAs(testInfo.outputPath(`handwriting.${format}`));
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream!) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (format === 'png') expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    else expect(bytes.subarray(0, 6).toString()).toBe('GIF89a');
    for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeEnabled();
    await expect(page.locator('#status')).toBeEmpty();
  });
}

test('editing during a raster export keeps exports disabled and restores current input eligibility', async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/raster.ts', async route => {
    await ready;
    await route.continue();
  });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-png').click();
  await expect(page.locator('#export-png')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#text').fill('Hello 你好');
  await expect(page.locator('#warning')).toBeVisible();
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeDisabled();
  release();
  await downloadEvent;
  await expect(page.locator('#export-png')).not.toHaveAttribute('aria-busy');
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeDisabled();
  await page.locator('#text').fill('Ready again');
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeEnabled();
});

test('video downloads and leaves the success status empty', async ({ page }, testInfo) => {
  await page.locator('#text').fill('Hi');
  await page.locator('#speed').fill('3');
  const button = page.getByRole('button', { name: '视频', exact: true });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('title', /MP4.*WebM/);
  const downloadEvent = page.waitForEvent('download');
  await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('inkmotion-animated.mp4');
  await download.saveAs(testInfo.outputPath('handwriting.mp4'));
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).subarray(4, 8).toString()).toBe('ftyp');
  for (const control of await page.locator('.export-controls button').all()) await expect(control).toBeEnabled();
  await expect(page.locator('#status')).toBeEmpty();
});

test('unavailable video encoding disables only video export with a translated explanation', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'MediaRecorder', { value: undefined }); });
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#export-video')).toBeDisabled();
  await expect(page.locator('#export-video')).toHaveAttribute('title', '当前浏览器不支持视频导出，请使用更新版本的浏览器。');
  await expect(page.locator('#export-png')).toBeEnabled();
  await expect(page.locator('#export-gif')).toBeEnabled();
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.locator('#export-video')).toHaveAccessibleName('Video');
  await expect(page.locator('#export-video')).toHaveAttribute('title', 'Video export is unavailable in this browser. Please use a newer browser.');
});

test('video download falls back to a correctly named WebM when MP4 recording is unavailable', async ({ page }) => {
  await page.evaluate(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = type => type.startsWith('video/webm') && supported(type);
  });
  await page.locator('#text').fill('Hi');
  await page.locator('#speed').fill('3');
  await expect(page.locator('#export-video')).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-video').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('inkmotion-animated.webm');
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect([...Buffer.concat(chunks).subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  await expect(page.locator('#status')).toBeEmpty();
});

test('a video encoder error restores export controls and shows the existing failure message', async ({ page }) => {
  await page.evaluate(() => { MediaRecorder.prototype.start = () => { throw new Error('Encoder failed'); }; });
  await page.locator('#export-video').click();
  await expect(page.locator('#status')).toHaveText('导出失败，请重试。');
  await expect(page.locator('#export-video')).not.toHaveAttribute('aria-busy');
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeEnabled();
});

test('numeric settings update the preview, survive reload and stay in sync with sliders', async ({ page }) => {
  const controls = [
    { key: 'fontSize', label: '字号', value: '64', sliderValue: '72' },
    { key: 'lineHeight', label: '行距', value: '2.15', sliderValue: '1.9' },
    { key: 'speed', label: '书写速度', value: '1.75', sliderValue: '2.5' },
    { key: 'strokeWidth', label: '笔画粗细', value: '2.6', sliderValue: '3.1' },
  ];
  for (const { key, label, value } of controls) {
    const previous = await page.locator('#drawing > svg').innerHTML();
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    await input.fill(value);
    await expect(input).toHaveValue(value);
    await expect(page.getByRole('slider', { name: label, exact: true })).toHaveValue(value);
    await expect(page.locator('#export')).toBeEnabled();
    expect(await page.locator('#drawing > svg').innerHTML()).not.toBe(previous);
    expect(await page.locator(`#${key}`).evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
  }
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  for (const { key, value } of controls) {
    await expect(page.locator(`#${key}-value`)).toHaveValue(value);
    await expect(page.locator(`#${key}`)).toHaveValue(value);
  }

  const preview = await page.locator('#drawing > svg').innerHTML();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const stream = await (await downloadEvent).createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  const exportedPreview = await page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    return document.importNode(root, true).innerHTML;
  }, data);
  expect(exportedPreview).toBe(preview);

  for (const { key, sliderValue } of controls) {
    await page.locator(`#${key}`).fill(sliderValue);
    await expect(page.locator(`#${key}-value`)).toHaveValue(sliderValue);
  }
  await page.locator('#speed-value').press('ArrowUp');
  await expect(page.locator('#speed-value')).toHaveValue('2.75');
  await expect(page.locator('#speed')).toHaveValue('2.75');
});

test('numeric settings preserve unfinished input and normalize committed values', async ({ page }) => {
  const controls = [
    { key: 'fontSize', min: '28', max: '96', unaligned: '65.4', rounded: '65' },
    { key: 'lineHeight', min: '1.3', max: '2.4', unaligned: '1.33', rounded: '1.35' },
    { key: 'speed', min: '0.25', max: '3', unaligned: '1.37', rounded: '1.25' },
    { key: 'strokeWidth', min: '0.8', max: '4', unaligned: '1.86', rounded: '1.9' },
  ];
  for (const { key, min, max, unaligned, rounded } of controls) {
    const input = page.locator(`#${key}-value`);
    const slider = page.locator(`#${key}`);
    const initial = await input.inputValue();
    await input.fill('');
    await expect(slider).toHaveValue(initial);
    await input.press('Tab');
    await expect(input).toHaveValue(initial);
    await input.fill('-10');
    await expect(slider).toHaveValue(initial);
    await input.press('Enter');
    await expect(input).toHaveValue(min);
    await expect(slider).toHaveValue(min);
    await input.fill('999');
    await input.press('Tab');
    await expect(input).toHaveValue(max);
    await expect(slider).toHaveValue(max);
    await input.fill(unaligned);
    await expect(slider).toHaveValue(max);
    await input.press('Enter');
    await expect(input).toHaveValue(rounded);
    await expect(slider).toHaveValue(rounded);
    await input.fill('');
    await input.press('Escape');
    await expect(input).toHaveValue(rounded);
  }
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
  await expect(page.locator('.swatch[data-color="#243042"]')).toHaveAttribute('aria-pressed', 'true');
  await hexInput.fill('FF677D');
  await expect(swatch).toHaveAttribute('aria-pressed', 'true');
});

test('mobile has no horizontal overflow and transparent export preserves the background choice', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#lineHeight').fill('2');
  await expect(page.locator('#lineHeight-value')).toHaveValue('2');
  await page.locator('#background-palette [data-color="transparent"]').click();
  await page.getByRole('button', { name: '居中', exact: true }).click();
  await page.locator('#loop').check();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
  await expect(page.locator('#drawing animate').first()).toHaveAttribute('repeatCount', 'indefinite');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

for (const width of [1440, 760, 375, 320]) {
  test(`replay stays inside the canvas at the top right at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#background-palette [data-color="#ffffff"]').click();
    for (const { text, fontSize } of [
      { text: 'Hi', fontSize: '28' },
      { text: 'Hi', fontSize: '96' },
      { text: 'One\nTwo\nThree\nFour\nFive\nSix', fontSize: '96' },
    ]) {
      await page.locator('#text').fill(text);
      await page.locator('#fontSize').fill(fontSize);
      await expect(page.locator('#drawing title')).toHaveText(text);
      await expect(page.locator('#replay')).toBeEnabled();
      const canvas = (await page.locator('#drawing > svg').boundingBox())!;
      const replay = (await page.locator('#replay').boundingBox())!;
      const inset = width <= 600 ? 8 : 12;
      expect(replay.y - canvas.y).toBeCloseTo(inset, 1);
      expect(canvas.x + canvas.width - replay.x - replay.width).toBeCloseTo(inset, 1);
      expect(replay.x).toBeGreaterThan(canvas.x);
      expect(replay.y + replay.height).toBeLessThan(canvas.y + canvas.height);
      await page.locator('#replay').click();
      expect(await page.locator('#drawing > svg').evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
      if (text === 'Hi' && fontSize === '28') {
        await page.screenshot({ path: testInfo.outputPath('single-line-replay.png'), fullPage: true });
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const width of [1440, 900, 761, 760, 375, 320]) {
  test(`preview blends into the page above settings with responsive actions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('#export')).toBeEnabled();
    const editor = page.locator('.editor');
    const preview = page.locator('.preview-panel');

    await expect(editor.locator('details, summary')).toHaveCount(0);
    for (const id of ['lineHeight', 'alignment', 'background', 'loop', 'color-value', 'fontSize-value', 'lineHeight-value', 'speed-value', 'strokeWidth-value']) {
      await expect(editor.locator(`#${id}`)).toBeVisible();
    }
    const alignmentBox = (await page.locator('#alignment').boundingBox())!;
    let previousRight = alignmentBox.x;
    for (const button of await page.locator('#alignment button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(previousRight);
      expect(box.y).toBeGreaterThanOrEqual(alignmentBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(alignmentBox.y + alignmentBox.height);
      expect(box.x + box.width).toBeLessThanOrEqual(alignmentBox.x + alignmentBox.width);
      expect(box.width).toBeGreaterThanOrEqual(44);
      previousRight = box.x + box.width;
    }
    const valueAppearances = await editor.locator('.value-input:visible').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color, style.border, style.borderRadius, style.fontFamily, style.fontSize, style.padding, element.getBoundingClientRect().height];
    }));
    for (const appearance of valueAppearances) expect(appearance).toEqual(valueAppearances[0]);
    const colorCircleBox = (await editor.locator('#color-field .custom-color > span').boundingBox())!;
    const colorPlusBox = await editor.locator('#color-field .custom-color svg').evaluate((svg: SVGSVGElement) => {
      const bounds = svg.getBBox();
      const matrix = svg.getScreenCTM()!;
      const start = new DOMPoint(bounds.x, bounds.y).matrixTransform(matrix);
      const end = new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height).matrixTransform(matrix);
      return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
    });
    expect(colorPlusBox.x + colorPlusBox.width / 2).toBeCloseTo(colorCircleBox.x + colorCircleBox.width / 2, 1);
    expect(colorPlusBox.y + colorPlusBox.height / 2).toBeCloseTo(colorCircleBox.y + colorCircleBox.height / 2, 1);
    const editorBox = (await editor.boundingBox())!;
    const previewBox = (await preview.boundingBox())!;
    expect(editorBox.y).toBeGreaterThan(previewBox.y + previewBox.height);
    expect(previewBox.x).toBeCloseTo(editorBox.x, 1);
    expect(previewBox.width).toBeCloseTo(editorBox.width, 1);
    await expect(preview.getByRole('heading')).toHaveCount(0);
    for (const surface of [preview, page.locator('#paper')]) {
      await expect(surface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(surface).toHaveCSS('background-image', 'none');
      await expect(surface).toHaveCSS('border-top-width', '0px');
      await expect(surface).toHaveCSS('box-shadow', 'none');
    }
    await expect(page.locator('#drawing > svg > rect')).toHaveCount(0);
    await expect(page.locator('#status')).toBeEmpty();
    await expect(preview.locator('#play, #progress, #time, .transport')).toHaveCount(0);
    const replay = page.locator('#replay');
    await expect(replay).toHaveAccessibleName('重新播放');
    await expect(replay).toHaveText('');
    await expect(replay).toHaveAttribute('title', '重新播放');
    await expect(replay).toBeEnabled();
    const paperBox = (await page.locator('#paper').boundingBox())!;
    const paperArea = page.locator('.paper-area');
    const paperAreaBox = (await paperArea.boundingBox())!;
    expect(paperAreaBox.x).toBeCloseTo(previewBox.x, 1);
    expect(paperBox.x).toBeCloseTo(paperAreaBox.x, 1);
    expect(paperBox.y).toBeCloseTo(paperAreaBox.y, 1);
    expect(paperBox.width).toBeCloseTo(await paperArea.evaluate(element => element.clientWidth), 1);
    expect(paperBox.height).toBeGreaterThanOrEqual(paperAreaBox.height);
    const actionsBox = (await page.locator('.preview-actions').boundingBox())!;
    expect(actionsBox.x + actionsBox.width).toBeCloseTo(editorBox.x + editorBox.width, 1);
    expect(actionsBox.y).toBeGreaterThan(paperAreaBox.y + paperAreaBox.height);
    expect(paperAreaBox.width).toBeCloseTo(previewBox.width, 1);
    expect(actionsBox.x).toBeCloseTo(editorBox.x, 1);
    const canvasBox = (await page.locator('.canvas-preview').boundingBox())!;
    const replayBox = (await replay.boundingBox())!;
    expect(replayBox.x + replayBox.width).toBeLessThan(canvasBox.x + canvasBox.width);
    expect(replayBox.x + replayBox.width).toBeGreaterThan(canvasBox.x + canvasBox.width - 20);
    expect(replayBox.y).toBeGreaterThan(canvasBox.y);
    expect(replayBox.y).toBeLessThan(canvasBox.y + 20);
    await expect(page.locator('#export-mode')).toHaveCount(0);
    const controls = page.locator('.export-controls button');
    await expect(controls).toHaveCount(5);
    const actionBoxes = await controls.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    for (const [index, box] of actionBoxes.entries()) {
      expect(box.y).toBeCloseTo(actionBoxes[0].y, 1);
      expect(box.width).toBeCloseTo(actionBoxes[0].width, 0);
      expect(box.height).toBeCloseTo(actionBoxes[0].height, 1);
      if (index) expect(box.x).toBeCloseTo(actionBoxes[index - 1].x + actionBoxes[index - 1].width, 1);
    }
    expect(actionBoxes[0].x).toBeCloseTo(actionsBox.x + 1, 1);
    expect(actionBoxes[4].x + actionBoxes[4].width).toBeCloseTo(actionsBox.x + actionsBox.width - 1, 1);
    const exportPanel = page.locator('.export-controls');
    for (const property of ['background-color', 'border-top-color', 'border-top-width', 'border-radius', 'box-shadow']) {
      expect(await exportPanel.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property))
        .toBe(await editor.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const control of await editor.locator('textarea, input:visible, select:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(editorBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
    }
    for (const group of await editor.locator('.settings-group').all()) {
      const groupBox = (await group.boundingBox())!;
      for (const control of await group.locator('input:visible, select:visible, button:visible').all()) {
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
