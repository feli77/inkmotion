import { expect, test } from '@playwright/test';
import { fonts } from '../src/fonts';
import type { BrushPoint, Scene } from '../src/types';

const sampledFonts = fonts.filter(font => font.source.name === 'Tegaki');

const scene: Scene = {
  width: 160, height: 140, scale: 1, duration: 1, text: 'A', unsupported: [],
  settings: {
    fontId: 'caveat', fontSize: 56, strokeWidth: 8, speed: 1, color: '#243042',
    lineHeight: 1.65, alignment: 'left', background: 'transparent', loop: false, width: 160, padding: 20,
  },
  strokes: [{ d: 'M0 0L100 0', transform: 'translate(20 40)', length: 100, start: 0, end: 1 }],
};
const points: BrushPoint[] = [[0, 0, 8], [100, 0, 24]];

test.beforeEach(async ({ page }) => {
  await page.route('/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/');
});

for (const definition of sampledFonts) {
  test(`${definition.name} switches to native widths, exports standalone SVG and persists the selection`, async ({ page }) => {
    await page.unroute('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    await page.locator('#text').fill('Hello, InkMotion!\nWrite 123.');
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#export')).toBeEnabled();
    await expect(page.locator('#font option:checked')).toContainText(definition.name);
    await expect(page.locator('#drawing desc')).toContainText(`Tegaki / ${definition.name}`);
    expect(await page.locator('#drawing animate[attributeName="d"]').count()).toBeGreaterThan(100);
    for (const mode of ['animated', 'static']) {
      const downloaded = page.waitForEvent('download');
      await page.locator(mode === 'animated' ? '#export' : '#export-static').click();
      const stream = await (await downloaded).createReadStream();
      let source = '';
      for await (const chunk of stream!) source += chunk.toString();
      const result = await page.evaluate(source => {
        const document = new DOMParser().parseFromString(source, 'image/svg+xml');
        return {
          errors: document.querySelectorAll('parsererror, script, image, use').length,
          shapes: document.querySelectorAll('g[stroke="none"] path').length,
          animations: document.querySelectorAll('animate').length,
          metadata: document.querySelector('metadata')?.textContent,
        };
      }, source);
      expect(result.errors).toBe(0);
      expect(result.shapes).toBeGreaterThan(100);
      expect(result.animations > 0).toBe(mode === 'animated');
      expect(result.metadata).toContain(`${definition.name} from Tegaki`);
    }
    await page.reload();
    await expect(page.locator('#font')).toHaveValue(definition.id);
    await expect(page.locator('#export')).toBeEnabled();
    await page.locator('#text').fill('[]{}');
    await expect(page.locator('#warning')).toContainText('[ ] { }');
    await expect(page.locator('#export')).toBeDisabled();
  });
}

for (const definition of sampledFonts.filter(font => font.id !== 'caveat')) {
  test(`${definition.name} retains source advances and side bearings for connected letters`, async ({ page }) => {
    const result = await page.evaluate(async ({ definition, settings }) => {
      const { loadFont, createScene } = await import('/src/engine.ts');
      const font = await loadFont(definition.url);
      const scene = createScene(font, 'Make of it.', { ...settings, fontId: definition.id, fontSize: 72, strokeWidth: 1.8, width: 1200 });
      let index = 0;
      let advance = 0;
      const positions = [];
      for (const character of scene.text) {
        if (character === ' ') {
          advance += font.p.space * scene.scale;
          continue;
        }
        const glyph = font.c[String(character.codePointAt(0))];
        const origin = Number(scene.strokes[index].transform.match(/^translate\(([^ ]+)/)![1]);
        positions.push({ origin, advance });
        index += glyph.paths.length;
        advance += glyph.w * scene.scale;
      }
      return positions.map(position => ({ actual: position.origin - positions[0].origin, expected: position.advance }));
    }, { definition, settings: scene.settings });
    for (const position of result) expect(position.actual).toBeCloseTo(position.expected, 6);
  });
}

test('sampled fonts download on selection and reuse their local cache', async ({ page }) => {
  await page.unroute('/');
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/fonts/')) requests.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('#export')).toBeEnabled();
  expect(requests).toEqual(['/fonts/satisfy.json']);
  for (const definition of [...sampledFonts, ...sampledFonts]) {
    await page.locator('#font').selectOption(definition.id);
    await expect(page.locator('#drawing metadata')).toContainText(`Font paths: ${definition.name} from Tegaki`);
    await expect(page.locator('#export')).toBeEnabled();
  }
  expect(requests).toEqual(['/fonts/satisfy.json', ...sampledFonts.map(font => font.url)]);
});

for (const loop of [false, true]) {
  test(`variable widths stay on the paper and seeking matches raster geometry with loop=${loop}`, async ({ page }) => {
    const states = await page.evaluate(async ({ scene, points, loop }) => {
      const { createBrush } = await import('/src/brush.ts');
      const { exportSvg } = await import('/src/export.ts');
      scene.settings.loop = loop;
      scene.strokes[0].brush = createBrush(points, [], 1);
      const parse = (source: string) => document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
      const animated = parse(exportSvg(scene));
      document.body.replaceChildren(animated);
      animated.pauseAnimations();
      const probes = [[10, 0], [40, 0], [10, 4], [10, 6], [90, 8], [90, 14], [107, 0]];
      const contains = (svg: SVGSVGElement) => probes.map(([x, y]) => [...svg.querySelectorAll('path')].some(path =>
        Number(getComputedStyle(path).opacity) > 0 && path.isPointInFill({ x, y }),
      ));
      return [0, 0.25, 0.5, 1, 1.5, 2, 2.25, 0.25].map(time => {
        animated.setCurrentTime(time);
        const sampledTime = loop ? time % 2 : time;
        const frame = parse(exportSvg(scene, 'animated', sampledTime));
        document.body.append(frame);
        const state = { preview: contains(animated), frame: contains(frame) };
        frame.remove();
        return state;
      });
    }, { scene, points, loop });
    expect(states[0].preview).toEqual(Array(7).fill(false));
    expect(states[1].preview).toEqual([true, false, true, false, false, false, false]);
    expect(states[2].preview).toEqual([true, true, true, false, false, false, false]);
    expect(states[3].preview).toEqual([true, true, true, false, true, false, true]);
    expect(states[4]).toEqual(states[3]);
    expect(states[5]).toEqual(loop ? states[0] : states[3]);
    expect(states[6]).toEqual(loop ? states[1] : states[3]);
    expect(states[7]).toEqual(states[1]);
    for (const state of states) expect(state.frame).toEqual(state.preview);
  });
}

test('a self-crossing stroke leaves future arms hidden and retains earlier widths', async ({ page }) => {
  const result = await page.evaluate(async scene => {
    const { createBrush } = await import('/src/brush.ts');
    const { exportSvg } = await import('/src/export.ts');
    const brush = createBrush([[0, 0, 8], [100, 100, 8], [0, 100, 8], [100, 0, 24]], [], 1);
    scene.strokes[0].brush = brush;
    const svg = document.importNode(new DOMParser().parseFromString(exportSvg(scene), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    const contains = (x: number, y: number) => [...svg.querySelectorAll('path')].some(path => Number(getComputedStyle(path).opacity) > 0 && path.isPointInFill({ x, y }));
    svg.setCurrentTime(0.3);
    const halfway = [contains(50, 50), contains(70, 30), contains(0, 100)];
    svg.setCurrentTime(1);
    return { halfway, complete: [contains(50, 50), contains(70, 30), contains(0, 100)] };
  }, scene);
  expect(result.halfway).toEqual([true, false, false]);
  expect(result.complete).toEqual([true, true, true]);
});

test('a thinning round tip leaves its ink in place as it advances', async ({ page }) => {
  const ink = await page.evaluate(async scene => {
    const { createBrush } = await import('/src/brush.ts');
    const { exportSvg } = await import('/src/export.ts');
    scene.strokes[0].brush = createBrush([[0, 0, 20], [100, 0, 4]], [], 1);
    const svg = document.importNode(new DOMParser().parseFromString(exportSvg(scene), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    return [0.5, 0.75, 1].map(time => {
      svg.setCurrentTime(time);
      return svg.querySelector('path')!.isPointInFill({ x: 50.5, y: 5.975 });
    });
  }, scene);
  expect(ink).toEqual([true, true, true]);
});

test('native terminals wait for their trajectory point and appear in the completed PNG', async ({ page }) => {
  const result = await page.evaluate(async ({ scene, points }) => {
    const { createBrush } = await import('/src/brush.ts');
    const { exportSvg, exportFormats } = await import('/src/export.ts');
    scene.strokes[0].brush = createBrush(points, [[1, 0, 15, 16, 10, Math.PI / 4]], 1);
    const svg = document.importNode(new DOMParser().parseFromString(exportSvg(scene), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    const stamp = svg.querySelector('path:last-child')!;
    svg.setCurrentTime(0.9);
    const waiting = Number(getComputedStyle(stamp).opacity);
    svg.setCurrentTime(1);
    const complete = Number(getComputedStyle(stamp).opacity);
    const bitmap = await createImageBitmap(await exportFormats.png.serialize(scene, 'static'));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
    bitmap.close();
    return { waiting, complete, pixels: [pixel(30, 43), pixel(30, 46), pixel(110, 48), pixel(120, 55), pixel(0, 0)] };
  }, { scene, points });
  expect(result.waiting).toBe(0);
  expect(result.complete).toBe(1);
  expect(result.pixels).toEqual([[36, 48, 66, 255], [0, 0, 0, 0], [36, 48, 66, 255], [36, 48, 66, 255], [0, 0, 0, 0]]);
});

test('GIF keeps the variable-width geometry and its final hold', async ({ page }) => {
  const result = await page.evaluate(async ({ scene, points }) => {
    const { createBrush } = await import('/src/brush.ts');
    const { exportFormats } = await import('/src/export.ts');
    scene.strokes[0].brush = createBrush(points, [], 1);
    const blob = await exportFormats.gif.serialize(scene, 'animated');
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack!.frameCount;
    const canvas = document.createElement('canvas');
    canvas.width = scene.width;
    canvas.height = scene.height;
    const context = canvas.getContext('2d')!;
    const samples = [];
    let hold = 0;
    for (const frameIndex of [0, 10, count - 1]) {
      const { image } = await decoder.decode({ frameIndex });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      samples.push([[30, 44], [30, 46], [110, 48]].map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]));
      hold = image.duration;
      image.close();
    }
    decoder.close();
    return { samples, hold };
  }, { scene, points });
  expect(result.samples).toEqual([[0, 0, 0], [255, 0, 0], [255, 0, 255]]);
  expect(result.hold).toBe(1000000);
});

test('video decodes with the same variable widths and completed drawing', async ({ page }) => {
  const result = await page.evaluate(async ({ scene, points }) => {
    const { createBrush } = await import('/src/brush.ts');
    const { exportFormats } = await import('/src/export.ts');
    scene.strokes[0].brush = createBrush(points, [], 1);
    const blob = await exportFormats.video.serialize(scene, 'animated');
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    try {
      const loaded = new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Could not decode variable-width video'));
      });
      video.src = url;
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d')!;
      const samples = [];
      for (const time of [0, 0.5, 1.5]) {
        const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
        video.currentTime = time;
        await seeked;
        context.drawImage(video, 0, 0);
        samples.push([[50, 40], [50, 50], [110, 46]].map(([x, y]) => context.getImageData(x, y, 1, 1).data[0]));
      }
      return { samples, dimensions: [video.videoWidth, video.videoHeight] };
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
  }, { scene, points });
  expect(result.dimensions).toEqual([160, 140]);
  for (const channel of result.samples[0]) expect(channel).toBeGreaterThan(220);
  expect(result.samples[1][0]).toBeLessThan(100);
  expect(result.samples[1][1]).toBeGreaterThan(220);
  expect(result.samples[1][2]).toBeGreaterThan(220);
  expect(result.samples[2][0]).toBeLessThan(100);
  expect(result.samples[2][1]).toBeGreaterThan(220);
  expect(result.samples[2][2]).toBeLessThan(100);
});

for (const definition of sampledFonts) {
  test(`${definition.name} scales its widths with the thickness control and keeps geometry independent of speed`, async ({ page }) => {
    const result = await page.evaluate(async definition => {
      const { loadFont, createScene } = await import('/src/engine.ts');
      const font = await loadFont(definition.url);
      const settings = { fontId: definition.id, fontSize: 56, strokeWidth: 1.8, speed: 1, color: '#243042', lineHeight: 1.65, alignment: 'left' as const, background: 'transparent', loop: false, width: 400, padding: 24 };
      const normal = createScene(font, 'Hello.', settings);
      const fast = createScene(font, 'Hello.', { ...settings, speed: 2 });
      const thick = createScene(font, 'Hello.', { ...settings, strokeWidth: 3.6 });
      const widths = (scene: typeof normal) => scene.strokes.flatMap(stroke => stroke.brush!.segments.map(segment => segment.from[2]));
      return { normal: widths(normal), fast: widths(fast), thick: widths(thick), duration: normal.duration, fastDuration: fast.duration };
    }, definition);
    expect(new Set(result.normal).size).toBeGreaterThan(10);
    expect(result.fast).toEqual(result.normal);
    // Zero-width terminals retain a negligible minimum rather than disappearing.
    result.thick.forEach((width, index) => expect(width).toBeCloseTo(result.normal[index] * 2, 1));
    expect(result.fastDuration).toBeCloseTo(result.duration / 2, 8);
  });
}

test('a font with invalid width samples is rejected and can be retried after correction', async ({ page }) => {
  const font = { c: { '65': { paths: [{ d: 'M0 0L100 0', mx: 0, my: 0, points }], w: 100 } }, p: { tf: 1000, lh: 1000, space: 242, bsw: 8 } };
  const invalid = { ...font, c: { '65': { ...font.c['65'], paths: [{ ...font.c['65'].paths[0], points: [[0, 0, -1]] }] } } };
  await page.route('**/fonts/retry-width.json', route => route.fulfill({ json: invalid }));
  const rejected = await page.evaluate(async () => {
    try { await (await import('/src/engine.ts')).loadFont('/fonts/retry-width.json'); }
    catch (error) { return (error as Error).message; }
  });
  expect(rejected).toBe('Invalid stroke font');
  await page.unroute('**/fonts/retry-width.json');
  await page.route('**/fonts/retry-width.json', route => route.fulfill({ json: font }));
  expect(await page.evaluate(async () => (await (await import('/src/engine.ts')).loadFont('/fonts/retry-width.json')).c['65'].paths[0].points)).toEqual(points);
});
