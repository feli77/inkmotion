import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fonts } from '../src/fonts';
import type { FontData } from '../src/types';
import sourceGlyphs from './fixtures/svg-font-glyphs.json' with { type: 'json' };

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' });

test('removed EMS draft fonts fall back to Satisfy while keeping text and settings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('inkmotion.draft.v1', JSON.stringify({
      text: 'Keep this draft.',
      settings: { fontId: 'ems-allure', fontSize: 64, color: '#123456' },
    }));
  });
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/fonts/')) requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#font')).toHaveValue('satisfy');
  expect(await page.locator('#font option[value^="ems-"]').evaluateAll(options => options.map(option => option.getAttribute('value')))).toEqual(['ems-tech', 'ems-nixish']);
  await expect(page.locator('#text')).toHaveValue('Keep this draft.');
  await expect(page.locator('#drawing title')).toHaveText('Keep this draft.');
  await expect(page.locator('#fontSize-value')).toHaveValue('64');
  await expect(page.locator('#drawing > svg > g')).toHaveAttribute('stroke', '#123456');
  expect(requests).toEqual(['/fonts/satisfy.json']);
});

for (const definition of fonts.slice(1).filter(font => font.source.name !== 'Tegaki')) {
  test(`${definition.name} switches preview and SVG exports to its strokes and survives reload`, async ({ page }) => {
    const text = 'Hello, InkMotion!\nWrite 123.';
    const font: FontData = JSON.parse(readFileSync(`public${definition.url}`, 'utf8'));
    const paths = [...text].flatMap(character => font.c[String(character.codePointAt(0))]?.paths.map(path => path.d) ?? []);
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#font option')).toHaveCount(fonts.length);
    await page.locator('#text').fill(text);
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#export')).toBeEnabled();
    await expect.poll(() => page.locator('#drawing path').evaluateAll(elements => elements.map(path => path.getAttribute('d')))).toEqual(paths);
    await expect(page.locator('#warning')).toBeHidden();
    await expect(page.locator('#drawing desc')).toContainText(`${definition.source.name} / ${definition.name}`);

    const preview = await page.locator('#drawing path').evaluateAll(elements => elements.map(path => [path.getAttribute('d'), path.getAttribute('transform')]));
    for (const mode of ['animated', 'static']) {
      const downloadEvent = page.waitForEvent('download');
      await page.locator(mode === 'animated' ? '#export' : '#export-static').click();
      const download = await downloadEvent;
      const stream = await download.createReadStream();
      let svg = '';
      for await (const chunk of stream!) svg += chunk.toString();
      const exported = await page.evaluate(markup => {
        const document = new DOMParser().parseFromString(markup, 'image/svg+xml');
        return {
          paths: [...document.querySelectorAll('path')].map(path => [path.getAttribute('d'), path.getAttribute('transform')]),
          description: document.querySelector('desc')?.textContent,
          metadata: document.querySelector('metadata')?.textContent,
          animations: document.querySelectorAll('animate').length,
          errors: document.querySelectorAll('parsererror, text, script, image, use').length,
        };
      }, svg);
      expect(exported.paths).toEqual(preview);
      expect(exported.description).toContain(`${definition.source.name} / ${definition.name}`);
      expect(exported.metadata).toContain(`Font paths: ${definition.name} from ${definition.source.name}`);
      expect(exported.metadata).toContain(definition.source.url);
      expect(exported.animations > 0).toBe(mode === 'animated');
      expect(exported.errors).toBe(0);
    }

    await page.reload();
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#font')).toHaveValue(definition.id);
    await expect(page.locator('#text')).toHaveValue(text);
    await expect.poll(() => page.locator('#drawing path').evaluateAll(elements => elements.map(path => path.getAttribute('d')))).toEqual(paths);
  });
}

test('extended Latin text works with converted fonts and warns again when the font lacks glyphs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#text').fill('Café, mañana, über, façade, Æsir!');
  await expect(page.locator('#warning')).toBeVisible();
  await expect(page.locator('#export')).toBeDisabled();
  for (const definition of fonts.filter(font => ['Evil Mad Scientist', 'isdaT'].includes(font.source.name))) {
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#drawing metadata')).toContainText(definition.name);
    await expect(page.locator('#warning')).toBeHidden();
    await expect(page.locator('#export')).toBeEnabled();
  }
  await page.locator('#font').selectOption('satisfy');
  await expect(page.locator('#warning')).toContainText('请更换字体');
  await expect(page.locator('#export')).toBeDisabled();
});

test('SVG conversion preserves source curves, orientation, width and pen lifts', async ({ page }) => {
  await page.goto('/');
  for (const sample of sourceGlyphs) {
    const result = await page.evaluate(async sample => {
      const { loadFont } = await import('/src/engine.ts');
      const font = await loadFont(`/fonts/${sample.fontId}.json`);
      const glyph = font.c[String(sample.character.codePointAt(0))];
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      document.body.append(svg);
      const measure = (data: string[], flip = false) => {
        const group = document.createElementNS(ns, 'g');
        svg.replaceChildren(group);
        let length = 0;
        for (const d of data) {
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', d);
          if (flip) path.setAttribute('transform', 'scale(1 -1)');
          group.append(path);
          length += path.getTotalLength();
        }
        const box = group.getBBox();
        return [box.x, box.y, box.width, box.height, length];
      };
      const original = measure([sample.d], true);
      const converted = measure(glyph.paths.map(path => path.d));
      svg.remove();
      return { original, converted, width: glyph.w, count: glyph.paths.length, units: font.p.tf };
    }, sample);
    expect(result.width).toBe(sample.width);
    expect(result.units).toBe(1000);
    expect(result.count).toBe((sample.d.match(/[Mm]/g) ?? []).length);
    result.converted.forEach((value, index) => expect(value).toBeCloseTo(result.original[index], 2));
  }
});

test('loads fonts on demand, retries a failed switch and reuses downloaded fonts', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/fonts/')) requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  expect(requests).toEqual(['/fonts/satisfy.json']);
  await page.route('**/fonts/pacifico.json', route => route.fulfill({ status: 503, body: '' }));
  await page.locator('#font').selectOption('pacifico');
  await expect(page.locator('#retry')).toBeVisible();
  await expect(page.locator('#export')).toBeDisabled();
  await page.unroute('**/fonts/pacifico.json');
  await page.locator('#retry').click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#drawing metadata')).toContainText('Pacifico');
  await page.locator('#font').selectOption('satisfy');
  await expect(page.locator('#drawing metadata')).toContainText('Satisfy');
  await page.locator('#font').selectOption('pacifico');
  await expect(page.locator('#drawing metadata')).toContainText('Pacifico');
  expect(requests).toEqual(['/fonts/satisfy.json', '/fonts/pacifico.json', '/fonts/pacifico.json']);
});

test('a late font response keeps the most recently selected font active', async ({ page }) => {
  let finish!: () => Promise<void>;
  await page.route('**/fonts/pacifico.json', async route => {
    const response = await route.fetch();
    finish = async () => { await route.fulfill({ response }); };
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#font').selectOption('pacifico');
  await expect.poll(() => Boolean(finish)).toBe(true);
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#font').selectOption('parisienne');
  await expect(page.locator('#drawing metadata')).toContainText('Parisienne');
  await expect(page.locator('#export')).toBeEnabled();
  const lateResponse = page.waitForResponse('**/fonts/pacifico.json');
  await finish();
  await (await lateResponse).finished();
  // Await the same shared download promise so its selection callback has run.
  await page.evaluate(async () => { await (await import('/src/engine.ts')).loadFont('/fonts/pacifico.json'); });
  await expect(page.locator('#font')).toHaveValue('parisienne');
  await expect(page.locator('#drawing metadata')).toContainText('Parisienne');
});

for (const width of [1440, 320]) {
  test(`font choices and previews fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    for (const definition of fonts.slice(1)) {
      await page.locator('#font').selectOption(definition.id);
      await expect(page.locator('#drawing metadata')).toContainText(definition.name);
      await expect(page.locator('#export')).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = (await page.locator('#font').boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`${definition.id}.png`), fullPage: true });
    }
  });
}
