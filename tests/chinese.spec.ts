import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' });

const settings = {
  fontId: 'chinese-kaiti', fontSize: 56, strokeWidth: 1.8, speed: 3,
  color: '#171717', lineHeight: 1.65, alignment: 'left' as const,
  background: 'transparent', loop: false, width: 360, padding: 24,
};

test('loads unique Chinese glyphs on demand, mixes scripts and restores the draft', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/fonts/chinese-kaiti/')) requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  expect(requests).toEqual([]);
  const text = '你好，你好！Hello 123，繁體中文。';
  await page.locator('#text').fill(text);
  await page.locator('#font').selectOption('chinese-kaiti');
  await expect(page.locator('#drawing title')).toHaveText(text);
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#warning')).toBeHidden();
  expect(requests.sort()).toEqual([...new Set([...'你好繁體中文'])].map(char => `/fonts/chinese-kaiti/${char.codePointAt(0)}.json`).sort());
  expect(await page.locator('#drawing mask').count()).toBeGreaterThan(40);
  for (const mode of ['animated', 'static']) {
    const downloading = page.waitForEvent('download');
    await page.locator(mode === 'animated' ? '#export' : '#export-static').click();
    const stream = await (await downloading).createReadStream();
    let source = '';
    for await (const chunk of stream!) source += chunk.toString();
    expect(source).toContain('InkMotion Kaiti from Make Me a Hanzi');
    expect(source).toContain('Relief SingleLine from isdaT');
    expect(source.includes('<animate')).toBe(mode === 'animated');
    expect(source).not.toMatch(/<(?:script|image|text|use)\b|href=/);
  }
  const count = requests.length;
  await page.locator('#text').fill('你好！Hello');
  await expect(page.locator('#drawing title')).toHaveText('你好！Hello');
  expect(requests).toHaveLength(count);
  await page.reload();
  await expect(page.locator('#font')).toHaveValue('chinese-kaiti');
  await expect(page.locator('#drawing title')).toHaveText('你好！Hello');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#text').fill('你好𰻞🙂');
  await expect(page.locator('#warning')).toContainText('𰻞 🙂');
  await expect(page.locator('#export')).toBeDisabled();
  expect(requests).toHaveLength(count + 2);
});

test('retries failed glyph downloads and ignores late input and font responses', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#text').fill('中');
  await page.route('**/fonts/chinese-kaiti/20013.json', route => route.fulfill({ status: 503, body: '' }));
  await page.locator('#font').selectOption('chinese-kaiti');
  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#export')).toBeDisabled();
  await page.unroute('**/fonts/chinese-kaiti/20013.json');
  await page.locator('#retry').click();
  await expect(page.locator('#drawing title')).toHaveText('中');
  await expect(page.locator('#export')).toBeEnabled();

  let release!: () => Promise<void>;
  await page.route('**/fonts/chinese-kaiti/25991.json', async route => {
    const response = await route.fetch();
    release = async () => { await route.fulfill({ response }); };
  });
  await page.locator('#text').fill('文');
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#text').fill('中');
  await expect(page.locator('#drawing title')).toHaveText('中');
  await release();
  await page.evaluate(async () => {
    const { loadFont, loadFontGlyphs } = await import('/src/engine.ts');
    await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), '文');
  });
  await expect(page.locator('#drawing title')).toHaveText('中');
  await page.unroute('**/fonts/chinese-kaiti/25991.json');

  release = undefined!;
  await page.route('**/fonts/chinese-kaiti/27704.json', async route => {
    const response = await route.fetch();
    release = async () => { await route.fulfill({ response }); };
  });
  await page.locator('#text').fill('永');
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator('#font').selectOption('satisfy');
  await expect(page.locator('#drawing metadata')).toContainText('Satisfy from Vara.js');
  await release();
  await page.evaluate(async () => {
    const { loadFont, loadFontGlyphs } = await import('/src/engine.ts');
    await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), '永');
  });
  await expect(page.locator('#drawing metadata')).toContainText('Satisfy from Vara.js');
  await expect(page.locator('#warning')).toContainText('永');
});

test('waits for Chinese input composition before requesting glyphs', async ({ page }) => {
  await page.goto('/');
  await page.locator('#font').selectOption('chinese-kaiti');
  await expect(page.locator('#export')).toBeEnabled();
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/fonts/chinese-kaiti/')) requests++; });
  await page.locator('#text').dispatchEvent('compositionstart');
  await page.locator('#text').evaluate((input: HTMLTextAreaElement) => {
    input.value = '你好';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect(page.locator('#export')).toBeDisabled();
  // Longer than the editor debounce, so an accidental intermediate render is observable.
  await page.waitForTimeout(350);
  expect(requests).toBe(0);
  await page.locator('#text').dispatchEvent('compositionend');
  await expect(page.locator('#drawing title')).toHaveText('你好');
  await expect(page.locator('#export')).toBeEnabled();
  expect(requests).toBe(2);
});

test('finishing an earlier export cannot re-enable stale output after a glyph failure', async ({ page }) => {
  await page.goto('/');
  await page.locator('#text').fill('中');
  await page.locator('#font').selectOption('chinese-kaiti');
  await expect(page.locator('#drawing title')).toHaveText('中');
  await expect(page.locator('#export-png')).toBeEnabled();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/raster.ts', async route => {
    await ready;
    await route.continue();
  });
  await page.route('**/fonts/chinese-kaiti/25991.json', route => route.fulfill({ status: 503, body: '' }));
  const downloaded = page.waitForEvent('download');
  await page.locator('#export-png').click();
  await expect(page.locator('#export-png')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#text').fill('文');
  await expect(page.locator('#retry')).toBeVisible();
  release();
  await downloaded;
  await expect(page.locator('#export-png')).not.toHaveAttribute('aria-busy');
  for (const button of await page.locator('.export-controls button').all()) await expect(button).toBeDisabled();
  await page.unroute('**/fonts/chinese-kaiti/25991.json');
  await page.locator('#retry').click();
  await expect(page.locator('#drawing title')).toHaveText('文');
  await expect(page.locator('#export')).toBeEnabled();
});

test('preserves Chinese punctuation, stroke order, layout bounds and deterministic timing', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async settings => {
    const { loadFont, loadFontGlyphs, createScene, renderScene } = await import('/src/engine.ts');
    const text = '天地，人和。《中文》Hello！\n\n繁體　中文“你好”…';
    const font = await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), text + '永一中');
    const scene = createScene(font, text, { ...settings, width: 240 });
    let index = 0;
    const lines = new Map<string, string>();
    for (const char of scene.text.replace(/\n/g, '')) {
      const glyph = font.c[String(char.codePointAt(0))];
      if (!glyph) continue;
      const y = scene.strokes[index].transform.match(/^translate\([^ ]+ ([^)]+)/)![1];
      lines.set(y, (lines.get(y) ?? '') + char);
      index += glyph.paths.length;
    }
    const bounds = [];
    for (const alignment of ['left', 'center', 'right'] as const) {
      for (const strokeWidth of [0.8, 1.8, 4]) {
        const current = createScene(font, text, { ...settings, alignment, strokeWidth, width: 240 });
        const svg = renderScene(current);
        document.body.append(svg);
        svg.pauseAnimations();
        svg.setCurrentTime(current.duration);
        const box = svg.querySelector('g')!.getBBox();
        svg.remove();
        bounds.push(box.x >= 0 && box.y >= 0 && box.x + box.width <= current.width && box.y + box.height <= current.height);
      }
    }
    const sample = createScene(font, '永', settings);
    const faster = createScene(font, '永', { ...settings, speed: 6 });
    const baseline = (text: string) => createScene(font, text, settings).strokes[0].transform.match(/^translate\([^ ]+ ([^)]+)/)![1];
    return {
      text: scene.text, unsupported: scene.unsupported, lines: [...lines.values()], bounds,
      paths: sample.strokes.map(stroke => stroke.outline?.d),
      originals: font.c['27704'].paths.map(path => path.outline?.d),
      duration: sample.duration, faster: faster.duration,
      ordered: sample.strokes.every((stroke, i) => !i || stroke.start > sample.strokes[i - 1].end),
      baselines: ['一', '中', 'Hello', '一中Hello'].map(baseline),
    };
  }, settings);
  expect(result.text).toContain('“你好”…');
  expect(result.text).toContain('　');
  expect(result.unsupported).toEqual([]);
  for (const line of result.lines) {
    expect(line).not.toMatch(/^[，。！？、；：）》」』”’…]/);
    expect(line).not.toMatch(/[（《「『“‘]$/);
  }
  expect(result.bounds.every(Boolean)).toBe(true);
  expect(result.paths).toEqual(result.originals);
  expect(result.paths).toHaveLength(5);
  expect(result.faster).toBeCloseTo(result.duration / 2, 8);
  expect(result.ordered).toBe(true);
  expect(new Set(result.baselines).size).toBe(1);
});

for (const width of [1440, 320]) {
  test(`mixed Chinese preview and controls fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.locator('#text').fill('你好，世界！\nHello, InkMotion.\n繁體中文《手寫動畫》');
    await page.locator('#font').selectOption('chinese-kaiti');
    await expect(page.locator('#drawing title')).toHaveText('你好，世界！\nHello, InkMotion.\n繁體中文《手寫動畫》');
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#warning')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = (await page.locator('#drawing > svg').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`chinese-${width}.png`), fullPage: true });
    // The existing preview scrolls vertically for long text; its last stroke
    // must remain reachable on narrow screens rather than being cropped away.
    await page.locator('.paper-area').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const last = (await page.locator('#drawing > svg > g > :last-child').boundingBox())!;
    const area = (await page.locator('.paper-area').boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(area.y + area.height);
  });
}
