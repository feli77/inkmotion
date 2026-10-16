import { expect, test } from '@playwright/test';
import { fonts } from '../src/fonts';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' });

const handwritingFonts = fonts.filter(font => font.id === 'ink-pen' || font.id === 'ink-note');
const settings = {
  fontId: 'ink-pen', fontSize: 56, strokeWidth: 1.8, speed: 3, color: '#171717',
  lineHeight: 1.65, alignment: 'left' as const, background: 'transparent', loop: false, width: 360, padding: 24,
};
const text = '写下心中的热爱。\nHello 123，手寫文字！';

test('switching to a cached Chinese font cancels the pending input render', async ({ page }) => {
  await page.goto('/');
  await page.locator('#text').fill('你好');
  await page.locator('#font').selectOption('ink-pen');
  await expect(page.locator('#drawing metadata')).toContainText('InkMotion Pen');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#font').selectOption('satisfy');
  await expect(page.locator('#drawing metadata')).toContainText('Satisfy');
  const additions = await page.evaluate(async () => {
    let additions = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof SVGSVGElement) additions++;
      }
    });
    observer.observe(document.querySelector('#drawing')!, { childList: true });
    document.querySelector('#text')!.dispatchEvent(new Event('input', { bubbles: true }));
    const select = document.querySelector<HTMLSelectElement>('#font')!;
    select.value = 'ink-pen';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 400));
    observer.disconnect();
    return additions;
  });
  expect(additions).toBe(1);
  await expect(page.locator('#drawing metadata')).toContainText('InkMotion Pen');
});

test('groups Chinese fonts, keeps font-specific glyph caches and translates group labels', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (/\/fonts\/ink-(pen|note)\/\d+\.json$/.test(request.url())) requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  expect(requests).toEqual([]);
  await expect(page.locator('#font optgroup[label="中文手写"] option')).toHaveCount(3);
  await expect(page.locator('#font optgroup[label="拉丁手写"] option')).toHaveCount(11);
  await page.locator('#text').fill('你好！Hello []{}');
  const drawings = [];
  for (const definition of [...handwritingFonts, handwritingFonts[0]]) {
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#drawing metadata')).toContainText(`${definition.name} from ${definition.source.name}`);
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#warning')).toBeHidden();
    drawings.push(await page.locator('#drawing > svg').innerHTML());
  }
  expect(requests.sort()).toEqual(handwritingFonts.flatMap(font => ['你', '好'].map(char => `/fonts/${font.id}/${char.codePointAt(0)}.json`)).sort());
  expect(drawings[0]).not.toBe(drawings[1]);
  expect(drawings[0]).toBe(drawings[2]);
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.locator('#font optgroup[label="Chinese handwriting"] option')).toHaveCount(3);
  await expect(page.locator('#font optgroup[label="Latin handwriting"] option')).toHaveCount(11);
  await expect(page.locator('#font')).toHaveValue(handwritingFonts[0].id);
  await page.locator('#text').fill('你𰻞🙂');
  await expect(page.locator('#warning')).toContainText('𰻞 🙂');
  await expect(page.locator('#export')).toBeDisabled();
  expect(requests).toHaveLength(4);
});

for (const definition of handwritingFonts) {
  test(`${definition.name} exports self-contained sampled Chinese strokes and restores the selected font`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.locator('#text').fill(text);
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#drawing title')).toHaveText(text);
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#warning')).toBeHidden();
    expect(await page.locator('#drawing animate[attributeName="d"]').count()).toBeGreaterThan(100);
    await expect(page.locator('#drawing mask')).toHaveCount(0);
    for (const mode of ['animated', 'static']) {
      const downloaded = page.waitForEvent('download');
      await page.locator(mode === 'animated' ? '#export' : '#export-static').click();
      const stream = await (await downloaded).createReadStream();
      let source = '';
      for await (const chunk of stream!) source += chunk.toString();
      expect(source).toContain(`${definition.name} from ${definition.source.name}`);
      expect(source).toContain('SIL OFL 1.1');
      expect(source).toContain('Stroke extraction: Tegaki');
      expect(source.includes('<animate')).toBe(mode === 'animated');
      expect(source).not.toMatch(/<(?:script|image|text|use)\b|href=/);
    }
    await page.reload();
    await expect(page.locator('#font')).toHaveValue(definition.id);
    await expect(page.locator('#drawing title')).toHaveText(text);
    await expect(page.locator('#export')).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test(`${definition.name} retains native pen widths, advances, baseline and unclipped Chinese layout`, async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async ({ definition, settings, text }) => {
      const { loadFont, loadFontGlyphs, createScene, renderScene } = await import('/src/engine.ts');
      const manifest = await loadFont(definition.url);
      const font = await loadFontGlyphs(manifest, text + '永');
      const sample = createScene(font, '永', { ...settings, fontId: definition.id });
      const native = font.c['27704'];
      const faster = createScene(font, '永', { ...settings, fontId: definition.id, speed: 6 });
      const widths = native.paths.flatMap(path => path.points?.map(point => point[2]) ?? []);
      const nativePoints = native.paths.reduce((sum, path) => sum + path.points!.length, 0);
      const geometryPoints = sample.strokes.reduce((sum, stroke) => sum + (stroke.brush?.segments.length ?? 0), 0);
      const bounds = [];
      for (const width of [240, 640]) for (const strokeWidth of [0.8, 4]) for (const alignment of ['left', 'center', 'right'] as const) {
        const scene = createScene(font, text, { ...settings, fontId: definition.id, width, strokeWidth, alignment });
        const svg = renderScene(scene);
        document.body.append(svg);
        svg.pauseAnimations();
        svg.setCurrentTime(scene.duration);
        const box = svg.querySelector('g')!.getBBox();
        svg.remove();
        bounds.push(box.x >= 0 && box.y >= 0 && box.x + box.width <= scene.width && box.y + box.height <= scene.height);
      }
      const mixed = createScene(font, '永H', { ...settings, fontId: definition.id });
      const x = (index: number) => Number(mixed.strokes[index].transform.match(/^translate\(([^ ]+)/)![1]);
      return {
        coverage: [...manifest.glyphs!.characters].length, manifestHasHan: Boolean(manifest.c['27704']),
        originalUnchanged: Object.keys(manifest.c).length < Object.keys(font.c).length,
        variedWidths: Math.max(...widths) - Math.min(...widths), nativePoints, geometryPoints,
        expectedAdvance: native.w * mixed.scale, actualAdvance: x(native.paths.length) - x(0),
        bounds, duration: sample.duration, faster: faster.duration, unsupported: mixed.unsupported,
      };
    }, { definition, settings, text });
    expect(result.coverage).toBe(3879);
    expect(result.manifestHasHan).toBe(false);
    expect(result.originalUnchanged).toBe(true);
    expect(result.variedWidths).toBeGreaterThan(5);
    expect(result.geometryPoints).toBeGreaterThan(10);
    expect(result.geometryPoints).toBeLessThanOrEqual(result.nativePoints);
    expect(result.actualAdvance).toBeCloseTo(result.expectedAdvance, 6);
    expect(result.unsupported).toEqual([]);
    expect(result.bounds.every(Boolean)).toBe(true);
    expect(result.faster).toBeCloseTo(result.duration / 2, 8);
  });

  test(`${definition.name} PNG and decoded GIF preserve native Chinese ink and stroke timing`, async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async ({ definition, settings }) => {
      const { loadFont, loadFontGlyphs, createScene } = await import('/src/engine.ts');
      const { exportFormats, exportSvg } = await import('/src/export.ts');
      const { drawSvg, createCanvas } = await import('/src/raster.ts');
      const font = await loadFontGlyphs(await loadFont(definition.url), '永');
      const scene = createScene(font, '永', { ...settings, fontId: definition.id });
      const canvas = createCanvas(scene);
      const context = canvas.getContext('2d')!;
      const ink = () => {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) count++;
        return count;
      };
      const png = await createImageBitmap(await exportFormats.png.serialize(scene, 'static'));
      context.drawImage(png, 0, 0);
      png.close();
      const completed = ink();
      const frames = [];
      for (const time of [0, scene.duration / 2, scene.duration]) {
        await drawSvg(context, exportSvg(scene, 'animated', time));
        frames.push(ink());
      }
      const gif = await exportFormats.gif.serialize(scene, 'animated');
      const decoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: gif.type });
      await decoder.tracks.ready;
      const decoded = [];
      for (const frameIndex of [0, decoder.tracks.selectedTrack!.frameCount - 1]) {
        const { image } = await decoder.decode({ frameIndex });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        image.close();
        decoded.push(ink());
      }
      decoder.close();
      return { completed, frames, decoded, corner: [...context.getImageData(0, 0, 1, 1).data] };
    }, { definition, settings });
    expect(result.completed).toBeGreaterThan(100);
    expect(result.frames[0]).toBe(0);
    expect(result.frames[1]).toBeGreaterThan(0);
    expect(result.frames[1]).toBeLessThan(result.completed);
    expect(result.frames[2]).toBe(result.completed);
    expect(result.decoded).toEqual([0, result.completed]);
    expect(result.corner).toEqual([0, 0, 0, 0]);
  });

  test(`${definition.name} video decodes with the completed Chinese handwriting`, async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async ({ definition, settings }) => {
      const { loadFont, loadFontGlyphs, createScene } = await import('/src/engine.ts');
      const { exportFormats } = await import('/src/export.ts');
      const font = await loadFontGlyphs(await loadFont(definition.url), '永');
      const scene = createScene(font, '永', { ...settings, fontId: definition.id });
      const blob = await exportFormats.video.serialize(scene, 'animated');
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true;
      try {
        const loaded = new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Handwriting video cannot be decoded'));
        });
        video.src = url;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const counts = [];
        for (const time of [0, scene.duration + 0.5]) {
          const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
          video.currentTime = time;
          await seeked;
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 128) ink++;
          counts.push(ink);
        }
        return { counts, corner: [...context.getImageData(0, 0, 1, 1).data] };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, { definition, settings });
    expect(result.counts[0]).toBe(0);
    expect(result.counts[1]).toBeGreaterThan(100);
    expect(result.corner).toEqual([255, 255, 255, 255]);
  });

  for (const width of [1440, 320]) {
    test(`${definition.name} fits mixed-script preview and controls at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await page.locator('#text').fill(text);
      await page.locator('#font').selectOption(definition.id);
      await expect(page.locator('#drawing title')).toHaveText(text);
      await expect(page.locator('#export')).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${definition.id}-${width}.png`), fullPage: true });
    });
  }
}
