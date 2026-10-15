import { expect, test } from '@playwright/test';

const scene = {
  width: 241, height: 121, scale: 0.5, duration: 2, text: 'Hello', unsupported: [],
  settings: {
    fontId: 'satisfy', fontSize: 50, strokeWidth: 4, speed: 1, color: '#243042',
    lineHeight: 1.5, alignment: 'left', background: 'transparent', loop: true,
    width: 241, padding: 20,
  },
  strokes: [
    { d: 'M 0 0 L 100 0', transform: 'translate(20 40) scale(0.5)', length: 100, start: 0, end: 1 },
    { d: 'M 0 0 L 100 0', transform: 'translate(20 70) scale(0.5)', length: 100, start: 1, end: 2 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('http://127.0.0.1:5173/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/');
});

for (const format of ['mp4', 'webm']) {
  test(`${format.toUpperCase()} decodes with matching stroke timing, a white background and a final hold`, async ({ page }, testInfo) => {
    const result = await page.evaluate(async ({ input, format }) => {
      if (format === 'webm') {
        const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
        MediaRecorder.isTypeSupported = type => type.startsWith('video/webm') && supported(type);
      }
      const moduleUrl = '/src/export.ts';
      const { exportFormats } = await import(moduleUrl);
      const adapter = exportFormats.video;
      const blob = await adapter.serialize(input, 'animated');
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      try {
        const loaded = new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error('Exported video cannot be decoded'));
        });
        video.src = url;
        await loaded;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        const samples = [];
        for (const time of [0, 0.5, 1.5, 2.5]) {
          const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
          video.currentTime = time;
          await seeked;
          context.drawImage(video, 0, 0);
          const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
          samples.push([pixel(0, 0), pixel(40, 40), pixel(60, 40), pixel(40, 70), pixel(60, 70), pixel(241, 121)]);
        }
        // MediaRecorder WebM files may discover duration only after seeking to their end.
        if (!Number.isFinite(video.duration)) {
          const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve(); });
          video.currentTime = 1e6;
          await seeked;
        }
        return {
          type: blob.type, extension: adapter.extension, bytes: [...new Uint8Array(await blob.arrayBuffer())],
          dimensions: [video.videoWidth, video.videoHeight], duration: video.duration, samples,
        };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, { input: scene, format });
    expect(result.type).toContain(`video/${format}`);
    expect(result.extension).toBe(format);
    expect(result.dimensions).toEqual([242, 122]);
    expect(result.duration).toBeGreaterThan(2.8);
    expect(result.duration).toBeLessThan(3.3);
    const blank = [255, 255, 255, 255];
    const ink = [36, 48, 66, 255];
    const expected = [
      [blank, blank, blank, blank, blank, blank],
      [blank, ink, blank, blank, blank, blank],
      [blank, ink, ink, ink, blank, blank],
      [blank, ink, ink, ink, ink, blank],
    ];
    for (const [index, sample] of result.samples.entries()) {
      for (const [pixelIndex, pixel] of sample.entries()) {
        pixel.forEach((channel, channelIndex) => expect(Math.abs(channel - expected[index][pixelIndex][channelIndex])).toBeLessThanOrEqual(18));
      }
    }
    await testInfo.attach(`handwriting.${format}`, { body: Buffer.from(result.bytes), contentType: result.type });
  });
}

test('a failed video recording releases its stream and canvas', async ({ page }) => {
  const result = await page.evaluate(async input => {
    let stream: MediaStream | undefined;
    let canvas: HTMLCanvasElement | undefined;
    const capture = HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream = function (fps) {
      canvas = this;
      stream = capture.call(this, fps);
      return stream;
    };
    MediaRecorder.prototype.start = () => { throw new Error('Simulated encoder failure'); };
    const moduleUrl = '/src/export.ts';
    const { exportFormats } = await import(moduleUrl);
    let message = '';
    try { await exportFormats.video.serialize(input, 'animated'); }
    catch (error) { message = (error as Error).message; }
    return { message, tracks: stream?.getTracks().map(track => track.readyState), canvas: [canvas?.width, canvas?.height] };
  }, scene);
  expect(result.message).toBe('Simulated encoder failure');
  expect(result.tracks).toEqual(['ended']);
  expect(result.canvas).toEqual([0, 0]);
});
