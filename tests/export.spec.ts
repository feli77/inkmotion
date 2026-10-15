import { expect, test } from '@playwright/test';

const settings = {
  fontId: 'satisfy', fontSize: 50, strokeWidth: 4, speed: 1, color: '#243042',
  lineHeight: 1.5, alignment: 'left', background: 'transparent', loop: false,
  width: 240, padding: 20,
};

const scene = {
  width: 240, height: 120, scale: 0.5, duration: 2, text: 'Hello', unsupported: [], settings,
  strokes: [
    { d: 'M 0 0 L 100 0', transform: 'translate(20 40) scale(0.5)', length: 100, start: 0, end: 1 },
    { d: 'M 0 0 L 100 0', transform: 'translate(20 70) scale(0.5)', length: 100, start: 1, end: 2 },
  ],
};

test.beforeEach(async ({ page }) => {
  // Load a blank document so the app's observers cannot interfere with SVG tests.
  await page.route('http://127.0.0.1:5173/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/');
});

test('exports safe, standalone static SVG including special characters and empty input', async ({ page }) => {
  const result = await page.evaluate(async (input) => {
    const moduleUrl = '/src/export.ts';
    const { exportSvg, exportFormats } = await import(moduleUrl);
    const unsafe = {
      ...input,
      text: 'A & B <script>alert("x")</script> \u0000',
      settings: { ...input.settings, color: 'url(https://example.com/ink)', background: '"><script/>' },
    };
    const svg = exportSvg(unsafe, 'static');
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const empty = new DOMParser().parseFromString(exportSvg({ ...input, text: '', strokes: [], duration: 0 }), 'image/svg+xml');
    const blob = await exportFormats.svg.serialize(input, 'static');
    return {
      parserErrors: document.querySelectorAll('parsererror').length,
      scripts: document.querySelectorAll('script').length,
      animations: document.querySelectorAll('animate, set').length,
      title: document.querySelector('title')?.textContent,
      ink: document.querySelector('g')?.getAttribute('stroke'),
      background: document.querySelector('rect')?.getAttribute('fill'),
      pathCount: document.querySelectorAll('path').length,
      emptyPathCount: empty.querySelectorAll('path').length,
      emptyParserErrors: empty.querySelectorAll('parsererror').length,
      blobType: blob.type,
      blobText: await blob.text(),
      svg,
    };
  }, scene);

  expect(result.parserErrors).toBe(0);
  expect(result.scripts).toBe(0);
  expect(result.animations).toBe(0);
  expect(result.title).toBe('A & B <script>alert("x")</script> \uFFFD');
  expect(result.ink).toBe('#262832');
  expect(result.background).toBe('#ffffff');
  expect(result.pathCount).toBe(2);
  expect(result.emptyPathCount).toBe(0);
  expect(result.emptyParserErrors).toBe(0);
  expect(result.blobType).toBe('image/svg+xml;charset=utf-8');
  expect(result.blobText).toContain('<path');
  expect(result.svg).not.toContain('<script>');
});

test('single playback hides waiting strokes and keeps the completed drawing', async ({ page }) => {
  const states = await page.evaluate(async (input) => {
    const moduleUrl = '/src/export.ts';
    const { exportSvg } = await import(moduleUrl);
    const parsed = new DOMParser().parseFromString(exportSvg(input), 'image/svg+xml');
    const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    const paths = [...svg.querySelectorAll('path')];
    return [0, 0.5, 1.5, 2.5, 20].map((time) => {
      svg.setCurrentTime(time);
      return paths.map((path) => ({
        opacity: Number(getComputedStyle(path).opacity),
        offset: Number.parseFloat(getComputedStyle(path).strokeDashoffset),
      }));
    });
  }, scene);

  expect(states[0][0].opacity).toBe(0);
  expect(states[0][1].opacity).toBe(0);
  expect(states[1][0].opacity).toBe(1);
  expect(states[1][0].offset).toBeGreaterThan(0);
  expect(states[1][1].opacity).toBe(0);
  expect(states[2][0].offset).toBe(0);
  expect(states[2][1].offset).toBeGreaterThan(0);
  for (const index of [3, 4]) {
    expect(states[index]).toEqual([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0 }]);
  }
});

test('scaled paths reveal the expected geometry and preserve canvas stroke thickness', async ({ page }) => {
  const result = await page.evaluate(async (input) => {
    const moduleUrl = '/src/export.ts';
    const { exportSvg } = await import(moduleUrl);
    const parsed = new DOMParser().parseFromString(exportSvg(input), 'image/svg+xml');
    const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    const path = svg.querySelector('path')!;
    svg.setCurrentTime(0);
    const initialCap = path.isPointInStroke({ x: 0, y: 0 });
    svg.setCurrentTime(0.5);
    const halfway = {
      drawn: path.isPointInStroke({ x: 40, y: 0 }),
      waiting: path.isPointInStroke({ x: 60, y: 0 }),
      withinWidth: path.isPointInStroke({ x: 20, y: 3 }),
      outsideWidth: path.isPointInStroke({ x: 20, y: 5 }),
    };
    svg.setCurrentTime(2.5);
    return {
      initialCap,
      halfway,
      completeEndpoint: path.isPointInStroke({ x: 100, y: 0 }),
      canvasWidth: Number.parseFloat(getComputedStyle(path).strokeWidth) * input.scale,
    };
  }, scene);

  // isPointInStroke includes actual dash/cap geometry, rather than just attributes.
  expect(result.initialCap).toBe(false);
  expect(result.halfway).toEqual({ drawn: true, waiting: false, withinWidth: true, outsideWidth: false });
  expect(result.completeEndpoint).toBe(true);
  expect(result.canvasWidth).toBe(4);
});

test('loop playback holds for one second then resets all strokes on the same cycle', async ({ page }) => {
  const states = await page.evaluate(async (input) => {
    const moduleUrl = '/src/export.ts';
    const { exportSvg } = await import(moduleUrl);
    const parsed = new DOMParser().parseFromString(exportSvg({
      ...input, settings: { ...input.settings, loop: true },
    }), 'image/svg+xml');
    const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    document.body.replaceChildren(svg);
    svg.pauseAnimations();
    const paths = [...svg.querySelectorAll('path')];
    return [2.1, 2.9, 3, 3.5, 4.5, 6].map((time) => {
      svg.setCurrentTime(time);
      return paths.map((path) => ({
        opacity: Number(getComputedStyle(path).opacity),
        offset: Number.parseFloat(getComputedStyle(path).strokeDashoffset),
      }));
    });
  }, scene);

  for (const index of [0, 1]) {
    expect(states[index]).toEqual([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0 }]);
  }
  for (const index of [2, 5]) {
    expect(states[index][0].opacity).toBe(0);
    expect(states[index][1].opacity).toBe(0);
    expect(states[index][0].offset).toBeGreaterThan(100);
    expect(states[index][1].offset).toBeGreaterThan(100);
  }
  expect(states[3][0].opacity).toBe(1);
  expect(states[3][0].offset).toBeGreaterThan(0);
  expect(states[3][1].opacity).toBe(0);
  expect(states[4][0].offset).toBe(0);
  expect(states[4][1].opacity).toBe(1);
  expect(states[4][1].offset).toBeGreaterThan(0);
});

for (const background of ['transparent', '#ffffff', '#000000', '#123456']) {
  test(`PNG contains the completed drawing with a ${background} background`, async ({ page }) => {
    const result = await page.evaluate(async (input) => {
      const moduleUrl = '/src/export.ts';
      const { exportFormats } = await import(moduleUrl);
      const blob = await exportFormats.png.serialize(input, 'static');
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
      const pixels = [pixel(0, 0), pixel(40, 40), pixel(69, 70)];
      const dimensions = [bitmap.width, bitmap.height];
      bitmap.close();
      return { type: blob.type, signature: [...new Uint8Array(await blob.arrayBuffer()).slice(0, 8)], dimensions, pixels };
    }, { ...scene, settings: { ...settings, background } });
    expect(result.type).toBe('image/png');
    expect(result.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.dimensions).toEqual([240, 120]);
    expect(result.pixels).toEqual([
      background === 'transparent' ? [0, 0, 0, 0] : [...[1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16)), 255],
      [36, 48, 66, 255], [36, 48, 66, 255],
    ]);
  });
}

for (const loop of [false, true]) {
  for (const background of ['transparent', '#ffffff', '#000000']) {
    test(`GIF preserves stroke timing, final hold and ${background} background with loop=${loop}`, async ({ page }) => {
      const result = await page.evaluate(async (input) => {
        const moduleUrl = '/src/export.ts';
        const { exportFormats } = await import(moduleUrl);
        const blob = await exportFormats.gif.serialize(input, 'animated');
        const data = await blob.arrayBuffer();
        // Chromium's native decoder verifies the actual encoded frames, including disposal.
        const decoder = new ImageDecoder({ data, type: blob.type });
        await decoder.tracks.ready;
        const frameCount = decoder.tracks.selectedTrack!.frameCount;
        const samples = [];
        const canvas = document.createElement('canvas');
        canvas.width = input.width;
        canvas.height = input.height;
        const context = canvas.getContext('2d')!;
        for (const frameIndex of [0, 10, 30, frameCount - 1]) {
          const { image } = await decoder.decode({ frameIndex });
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
          samples.push({
            width: image.displayWidth, height: image.displayHeight,
            timestamp: image.timestamp, duration: image.duration,
            pixels: [pixel(0, 0), pixel(40, 40), pixel(60, 40), pixel(40, 70), pixel(60, 70)],
          });
          image.close();
        }
        decoder.close();
        return { type: blob.type, header: new TextDecoder().decode(data.slice(0, 6)), repeats: new TextDecoder().decode(data).includes('NETSCAPE2.0'), frameCount, samples };
      }, { ...scene, settings: { ...settings, background, loop } });
      expect(result.type).toBe('image/gif');
      expect(result.header).toBe('GIF89a');
      expect(result.repeats).toBe(loop);
      expect(result.frameCount).toBe(41);
      const blank = background === 'transparent' ? [0, 0, 0, 0] : [...[1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16)), 255];
      const ink = [36, 48, 66, 255];
      expect(result.samples.map(sample => [sample.width, sample.height])).toEqual(Array(4).fill([240, 120]));
      expect(result.samples.map(sample => sample.timestamp)).toEqual([0, 500000, 1500000, 2000000]);
      expect(result.samples[3].duration).toBe(1000000);
      expect(result.samples.map(sample => sample.pixels)).toEqual([
        [blank, blank, blank, blank, blank],
        [blank, ink, blank, blank, blank],
        [blank, ink, ink, ink, blank],
        [blank, ink, ink, ink, ink],
      ]);
    });
  }
}

test('raster frame geometry matches the animated SVG at the same time', async ({ page }) => {
  const states = await page.evaluate(async (input) => {
    const moduleUrl = '/src/export.ts';
    const { exportSvg } = await import(moduleUrl);
    const parse = (source: string) => document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
    const animated = parse(exportSvg(input));
    document.body.append(animated);
    animated.pauseAnimations();
    const matches = [0, 0.5, 1, 1.5, 2].map(time => {
      animated.setCurrentTime(time);
      const frame = parse(exportSvg(input, 'animated', time));
      document.body.append(frame);
      const geometry = (svg: SVGSVGElement) => [...svg.querySelectorAll('path')].map(path => ({
        opacity: Number(getComputedStyle(path).opacity),
        offset: Number.parseFloat(getComputedStyle(path).strokeDashoffset),
      }));
      const result = { preview: geometry(animated), raster: geometry(frame), animations: frame.querySelectorAll('animate, set').length };
      frame.remove();
      return result;
    });
    return matches;
  }, scene);
  for (const state of states) {
    expect(state.raster).toEqual(state.preview);
    expect(state.animations).toBe(0);
  }
});

for (const duration of [1, 45.37]) {
  test(`GIF retains a ${duration}s writing duration while bounding frame count`, async ({ page }) => {
    const result = await page.evaluate(async (input) => {
      const moduleUrl = '/src/export.ts';
      const { exportFormats } = await import(moduleUrl);
      const blob = await exportFormats.gif.serialize(input, 'animated');
      const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
      await decoder.tracks.ready;
      const frameCount = decoder.tracks.selectedTrack!.frameCount;
      const { image } = await decoder.decode({ frameIndex: frameCount - 1 });
      const result = { frameCount, writingDuration: image.timestamp / 1000000, holdDuration: image.duration / 1000000 };
      image.close();
      decoder.close();
      return result;
    }, { ...scene, duration, strokes: scene.strokes.map(stroke => ({ ...stroke, start: stroke.start * duration / 2, end: stroke.end * duration / 2 })) });
    expect(result.frameCount).toBe(duration === 1 ? 21 : 600);
    expect(result.writingDuration).toBeCloseTo(duration, 2);
    expect(result.holdDuration).toBe(1);
  });
}
