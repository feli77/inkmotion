import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fonts } from '../src/fonts';
import type { FontData } from '../src/types';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' });

for (const definition of fonts.slice(1)) {
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
    await expect(page.locator('#drawing desc')).toContainText(`Vara.js / ${definition.name}`);

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
      expect(exported.description).toContain(`Vara.js / ${definition.name}`);
      expect(exported.metadata).toContain(`Font paths: ${definition.name} from Vara.js`);
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
