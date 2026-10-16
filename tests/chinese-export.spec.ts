import { expect, test } from '@playwright/test';

const settings = {
  fontId: 'chinese-kaiti', fontSize: 72, strokeWidth: 1.8, speed: 10,
  color: '#171717', lineHeight: 1.65, alignment: 'left' as const,
  background: 'transparent', loop: false, width: 240, padding: 24,
};

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:5173/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"></body></html>',
  }));
  await page.goto('/');
});

for (const loop of [false, true]) {
  for (const strokeWidth of [0.8, 1.8, 4]) {
    test(`Chinese outlines match preview, sampled frames and complete PNG with width=${strokeWidth}, loop=${loop}`, async ({ page }) => {
      const scene = await page.evaluate(async settings => {
        const { loadFont, loadFontGlyphs, createScene, renderScene } = await import('/src/engine.ts');
        const font = await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), '永');
        const scene = createScene(font, '永', settings);
        const svg = renderScene(scene);
        svg.style.display = 'block';
        document.body.replaceChildren(svg);
        svg.pauseAnimations();
        return scene;
      }, { ...settings, loop, strokeWidth });
      const middle = scene.strokes[0].end / 2;
      const times = [0, middle, scene.duration / 2, scene.duration + 0.1, middle];
      // SVG's serialized times and browser clock have sub-microsecond rounding.
      const reset = scene.duration + 1.0001;
      if (loop) times.push(scene.duration + 1 + middle, reset);
      for (const time of times) {
        await page.locator('svg').evaluate((svg: SVGSVGElement, time) => svg.setCurrentTime(time), time);
        const preview = (await page.locator('svg').screenshot({ omitBackground: true, animations: 'allow' })).toString('base64');
        const result = await page.evaluate(async ({ scene, time, preview }) => {
          const { exportSvg, exportFormats } = await import('/src/export.ts');
          const { createCanvas, drawSvg } = await import('/src/raster.ts');
          const normalized = scene.settings.loop ? time % (scene.duration + 1) : time;
          const canvas = createCanvas(scene);
          const context = canvas.getContext('2d')!;
          await drawSvg(context, exportSvg(scene, 'animated', normalized));
          const sampled = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${preview}`)).blob());
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let differences = 0;
          let ink = 0;
          for (let i = 3; i < actual.length; i += 4) {
            if (Math.abs(actual[i] - sampled[i]) > 12) differences++;
            if (actual[i] > 128) ink++;
          }
          let completeDifferences = 0;
          if (normalized >= scene.duration) {
            const complete = await createImageBitmap(await exportFormats.png.serialize(scene, 'static'));
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(complete, 0, 0);
            complete.close();
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < pixels.length; i += 4) if (Math.abs(pixels[i] - actual[i]) > 12) completeDifferences++;
          }
          return { differences, completeDifferences, ink };
        }, { scene, time, preview });
        expect(result.differences, `preview/frame at ${time}`).toBeLessThan(20);
        expect(result.completeDifferences, 'completed outline coverage').toBeLessThan(20);
        if (time === 0 || time === reset) expect(result.ink).toBe(0);
        if (time === scene.duration + 0.1) expect(result.ink).toBeGreaterThan(100);
      }
    });
  }
}

test('Chinese PNG and decoded GIF contain the same complete strokes and transparent background', async ({ page }) => {
  const result = await page.evaluate(async settings => {
    const { loadFont, loadFontGlyphs, createScene } = await import('/src/engine.ts');
    const { exportFormats } = await import('/src/export.ts');
    const font = await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), '永中文');
    const scene = createScene(font, '永中文', settings);
    const png = await createImageBitmap(await exportFormats.png.serialize(scene, 'static'));
    const canvas = document.createElement('canvas');
    canvas.width = scene.width;
    canvas.height = scene.height;
    const context = canvas.getContext('2d')!;
    const ink = () => {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) count++;
      return count;
    };
    context.drawImage(png, 0, 0);
    png.close();
    const expected = ink();
    const gif = await exportFormats.gif.serialize(scene, 'animated');
    const decoder = new ImageDecoder({ data: await gif.arrayBuffer(), type: gif.type });
    await decoder.tracks.ready;
    const counts = [];
    for (const frameIndex of [0, decoder.tracks.selectedTrack!.frameCount - 1]) {
      const { image } = await decoder.decode({ frameIndex });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      image.close();
      counts.push(ink());
    }
    const corner = [...context.getImageData(0, 0, 1, 1).data];
    decoder.close();
    return { expected, counts, corner };
  }, settings);
  expect(result.expected).toBeGreaterThan(500);
  expect(result.counts).toEqual([0, result.expected]);
  expect(result.corner).toEqual([0, 0, 0, 0]);
});

for (const format of ['mp4', 'webm']) {
  test(`decoded Chinese ${format.toUpperCase()} starts blank and finishes with the complete drawing`, async ({ page }) => {
    const result = await page.evaluate(async ({ settings, format }) => {
      if (format === 'webm') {
        const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
        MediaRecorder.isTypeSupported = type => type.startsWith('video/webm') && supported(type);
      }
      const { loadFont, loadFontGlyphs, createScene } = await import('/src/engine.ts');
      const { exportFormats } = await import('/src/export.ts');
      const font = await loadFontGlyphs(await loadFont('/fonts/chinese-kaiti.json'), '永');
      const scene = createScene(font, '永', settings);
      const blob = await exportFormats.video.serialize(scene, 'animated');
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true;
      try {
        const loaded = new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Chinese video cannot be decoded'));
        });
        video.src = url;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const count = () => {
          context.drawImage(video, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 128) ink++;
          return ink;
        };
        const firstSeek = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
        video.currentTime = 0;
        await firstSeek;
        const first = count();
        const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
        video.currentTime = scene.duration + 0.5;
        await seeked;
        return { type: blob.type, first, last: count(), corner: [...context.getImageData(0, 0, 1, 1).data] };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, { settings, format });
    expect(result.type).toContain(`video/${format}`);
    expect(result.first).toBe(0);
    expect(result.last).toBeGreaterThan(100);
    expect(result.corner.slice(0, 3)).toEqual([255, 255, 255]);
  });
}
