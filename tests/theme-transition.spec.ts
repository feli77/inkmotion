import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ locale: 'zh-CN', colorScheme: 'light' });

async function sampleViewport(page: Page): Promise<number[][]> {
  const screenshot = await page.screenshot();
  return page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const pixels: number[][] = [];
    for (let row = 0; row < 15; row++) {
      for (let column = 0; column < 21; column++) {
        const x = Math.floor((column + 0.5) * image.width / 21);
        const y = Math.floor((row + 0.5) * image.height / 15);
        pixels.push([...context.getImageData(x, y, 1, 1).data].slice(0, 3));
      }
    }
    return pixels;
  }, screenshot.toString('base64'));
}

async function pauseBrush(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().some(animation =>
    (animation.effect as KeyframeEffect | null)?.pseudoElement === '::view-transition-old(root)'));
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect as KeyframeEffect | null;
      if (effect?.pseudoElement || effect?.target?.closest('.theme-brush-mask')) {
        animation.pause();
        animation.currentTime = 0;
      }
    }
  });
}

async function seekBrush(page: Page, progress: number): Promise<void> {
  await page.evaluate(progress => {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect as KeyframeEffect | null;
      if (effect?.pseudoElement || effect?.target?.closest('.theme-brush-mask')) {
        animation.currentTime = Number(effect.getTiming().duration) * progress;
      }
    }
  }, progress);
}

function colorDistance(first: number[], second: number[]): number {
  return Math.max(...first.map((value, index) => Math.abs(value - second[index])));
}

for (const width of [1440, 375]) {
  test(`paints both themes cumulatively with a round diagonal brush across a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    await page.mouse.move(0, 0);
    const light = await sampleViewport(page);
    await page.locator('#theme-toggle').click();
    await page.mouse.move(0, 0);
    const dark = await sampleViewport(page);
    await page.locator('#theme-toggle').click();
    await page.mouse.move(0, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const comparable = light.map((pixel, index) => index)
      .filter(index => colorDistance(light[index], dark[index]) > 100);
    expect(comparable.length).toBeGreaterThan(150);

    for (const theme of ['dark', 'light']) {
      const previous = theme === 'dark' ? light : dark;
      const next = theme === 'dark' ? dark : light;
      const painted = new Set<number>();
      await page.locator('#theme-toggle').click();
      await pauseBrush(page);
      await page.mouse.move(0, 0);
      for (const progress of [0, 0.15, 0.4, 0.65, 0.85, 1]) {
        await seekBrush(page, progress);
        const pixels = await sampleViewport(page);
        let untouched = 0;
        let edge = 0;
        for (const index of comparable) {
          if (colorDistance(pixels[index], next[index]) < 8) painted.add(index);
          else if (colorDistance(pixels[index], previous[index]) < 8) {
            expect(painted.has(index), `painted pixel ${index} reverted at ${progress}`).toBe(false);
            untouched++;
          } else edge++;
        }
        // Only anti-aliased pixels on the brush edge may blend the two themes.
        expect(edge).toBeLessThan(4);
        if (progress === 0) expect(painted.size).toBe(0);
        else if (progress < 1) {
          expect(painted.size).toBeGreaterThan(0);
          if (progress < 0.85) expect(untouched).toBeGreaterThan(0);
        } else {
          const remaining = comparable.filter(index => !painted.has(index))
            .map(index => ({ index, actual: pixels[index], expected: next[index] }));
          expect(remaining).toEqual([]);
        }
        if (progress === 0.4) {
          await page.screenshot({ path: testInfo.outputPath(`${theme}-brush.png`) });
          // A '/' stroke reaches the left side before the lower right.
          expect(colorDistance(pixels[7 * 21], next[7 * 21])).toBeLessThan(8);
          expect(colorDistance(pixels[14 * 21 + 20], previous[14 * 21 + 20])).toBeLessThan(8);
        }
      }
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) {
          const effect = animation.effect as KeyframeEffect | null;
          if (effect?.pseudoElement || effect?.target?.closest('.theme-brush-mask')) animation.finish();
        }
      });
      await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }
  });
}

test('completes the entire theme transition within one second and preserves the drawing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  const drawing = (await page.locator('#drawing > svg').elementHandle())!;
  const elapsed = await page.evaluate(async () => {
    const root = document.documentElement;
    const started = performance.now();
    await new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (!root.classList.contains('theme-transition')) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(root, { attributes: true, attributeFilter: ['class'] });
      document.querySelector<HTMLButtonElement>('#theme-toggle')!.click();
    });
    return performance.now() - started;
  });
  expect(elapsed).toBeLessThan(1000);
  expect(await drawing.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('honors rapid repeated clicks and cleans up interrupted animations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#theme-toggle').click();
  await pauseBrush(page);
  await page.locator('#theme-toggle').click();
  await pauseBrush(page);
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    button.click();
    button.click();
    button.click();
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  expect(await page.evaluate(() => localStorage.getItem('inkmotion.theme.v1'))).toBe('dark');
  await page.locator('#text').fill('Still editable');
  await expect(page.locator('#drawing title')).toHaveText('Still editable');
  expect(await page.evaluate(() => document.getAnimations().filter(animation =>
    (animation.effect as KeyframeEffect | null)?.pseudoElement).length)).toBe(0);
  expect(errors).toEqual([]);
});

for (const fallback of ['reduced motion', 'unsupported browser']) {
  test(`switches immediately with ${fallback}`, async ({ page }) => {
    if (fallback === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'startViewTransition', { value: undefined });
    });
    await page.goto('/');
    for (const theme of ['dark', 'light']) {
      await page.locator('#theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
    }
  });
}

test('finishes cleanly when the viewport or reduced-motion preference changes during a brush stroke', async ({ page }) => {
  await page.goto('/');
  await page.locator('#theme-toggle').click();
  await pauseBrush(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-toggle').click();
  await pauseBrush(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/theme-transition/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
