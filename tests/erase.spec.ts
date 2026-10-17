import { expect, test } from '@playwright/test';
import type { Scene } from '../src/types';

const scene: Scene = {
  width: 240, height: 120, scale: 0.5, duration: 2, text: 'AB', unsupported: [],
  settings: {
    fontId: 'satisfy', fontSize: 50, strokeWidth: 4, speed: 1, color: '#243042',
    lineHeight: 1.5, alignment: 'left', background: 'transparent', loop: false,
    erase: true, holdDuration: 0.5, blankDuration: 0.75, width: 240, padding: 20,
  },
  strokes: [
    { d: 'M0 0L100 0', transform: 'translate(20 40) scale(0.5)', length: 100, start: 0, end: 1 },
    { d: 'M0 0L100 0', transform: 'translate(20 70) scale(0.5)', length: 100, start: 1, end: 2 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/');
});

const eraseOptions = [false, true].flatMap(loop => [0.25, 0.5, 1, 2, 3].map(eraseSpeed => ({ loop, eraseSpeed })));

for (const { loop, eraseSpeed } of eraseOptions) {
  test(`erasing follows the writing direction and order, with matching sampled frames, loop=${loop} and eraseSpeed=${eraseSpeed}`, async ({ page }) => {
    const result = await page.evaluate(async ({ input, loop, eraseSpeed }) => {
      const { exportSvg } = await import('/src/export.ts');
      input.settings.loop = loop;
      input.settings.eraseSpeed = eraseSpeed;
      const duration = 2.5 + 2 / eraseSpeed;
      const cycle = duration + 0.75;
      const parse = (source: string) => document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
      const svg = parse(exportSvg(input));
      document.body.append(svg);
      svg.pauseAnimations();
      const ink = (root: SVGSVGElement) => [...root.querySelectorAll('path')].flatMap(path => [20, 80].map(x =>
        Number(getComputedStyle(path).opacity) > 0 && path.isPointInStroke({ x, y: 0 }),
      ));
      const states = [0, 0.5, 2, 2.25, 2.5 + 0.25 / eraseSpeed, 2.5 + 1.25 / eraseSpeed, duration, duration + 0.5, cycle + 0.5, 0.5].map(time => {
        svg.setCurrentTime(time);
        const frame = parse(exportSvg(input, 'animated', loop ? time % cycle : time));
        document.body.append(frame);
        const state = { preview: ink(svg), frame: ink(frame) };
        frame.remove();
        return state;
      });
      const staticSvg = parse(exportSvg(input, 'static'));
      document.body.append(staticSvg);
      return { states, staticInk: ink(staticSvg), staticAnimations: staticSvg.querySelectorAll('animate, set').length };
    }, { input: scene, loop, eraseSpeed });
    const blank = [false, false, false, false];
    const complete = [true, true, true, true];
    expect(result.states.map(state => state.preview)).toEqual([
      blank, [true, false, false, false], complete, complete,
      [false, true, true, true], [false, false, false, true], blank, blank,
      loop ? [true, false, false, false] : blank, [true, false, false, false],
    ]);
    for (const state of result.states) expect(state.frame).toEqual(state.preview);
    expect(result.staticInk).toEqual(complete);
    expect(result.staticAnimations).toBe(0);
  });
}

for (const { loop, eraseSpeed } of eraseOptions) {
  test(`variable-width strokes and terminals erase forward with loop=${loop} and eraseSpeed=${eraseSpeed}`, async ({ page }) => {
    const states = await page.evaluate(async ({ input, loop, eraseSpeed }) => {
      const { createBrush } = await import('/src/brush.ts');
      const { exportSvg } = await import('/src/export.ts');
      input.duration = 1;
      input.settings.loop = loop;
      input.settings.eraseSpeed = eraseSpeed;
      const duration = 1.5 + 1 / eraseSpeed;
      const cycle = duration + 0.75;
      input.strokes = [input.strokes[0]];
      input.strokes[0].brush = createBrush([[0, 0, 8], [50, 0, 20], [100, 0, 8]], [
        [0, 0, 12, 8, 8, 0], [2, 0, 12, 8, 8, 0],
      ], 1);
      const parse = (source: string) => document.importNode(new DOMParser().parseFromString(source, 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
      const svg = parse(exportSvg(input));
      document.body.append(svg);
      svg.pauseAnimations();
      const probes = [[10, 0], [40, 0], [60, 0], [90, 0], [0, 12], [100, 12]];
      const ink = (root: SVGSVGElement) => probes.map(([x, y]) => [...root.querySelectorAll('path')].some(path =>
        Number(getComputedStyle(path).opacity) > 0 && path.isPointInFill({ x, y }),
      ));
      return [0, 1, 1.25, 1.5 + 0.25 / eraseSpeed, 1.5 + 0.75 / eraseSpeed, duration, duration + 0.5, cycle + 0.25, 1.5 + 0.25 / eraseSpeed].map(time => {
        svg.setCurrentTime(time);
        const frame = parse(exportSvg(input, 'animated', loop ? time % cycle : time));
        document.body.append(frame);
        const state = { preview: ink(svg), frame: ink(frame) };
        frame.remove();
        return state;
      });
    }, { input: scene, loop, eraseSpeed });
    const blank = Array(6).fill(false);
    expect(states.map(state => state.preview)).toEqual([
      blank, Array(6).fill(true), Array(6).fill(true),
      [false, true, true, true, false, true], [false, false, false, true, false, true],
      blank, blank, loop ? [true, false, false, false, true, false] : blank,
      [false, true, true, true, false, true],
    ]);
    for (const state of states) expect(state.frame).toEqual(state.preview);
  });
}

test('zero holds transition directly from writing to erasing and into the next cycle', async ({ page }) => {
  const states = await page.evaluate(async input => {
    const { exportSvg } = await import('/src/export.ts');
    input.settings = { ...input.settings, loop: true, holdDuration: 0, blankDuration: 0 };
    const svg = document.importNode(new DOMParser().parseFromString(exportSvg(input), 'image/svg+xml').documentElement, true) as unknown as SVGSVGElement;
    document.body.append(svg);
    svg.pauseAnimations();
    return [2, 2.5, 3.5, 4, 4.5].map(time => {
      svg.setCurrentTime(time);
      return [...svg.querySelectorAll('path')].flatMap(path => [20, 80].map(x =>
        Number(getComputedStyle(path).opacity) > 0 && path.isPointInStroke({ x, y: 0 }),
      ));
    });
  }, scene);
  expect(states).toEqual([
    [true, true, true, true], [false, true, true, true], [false, false, false, true],
    [false, false, false, false], [true, false, false, false],
  ]);
});

test('player seeks through both phases, stops after erasing and includes the blank hold when looping', async ({ page }) => {
  const result = await page.evaluate(async input => {
    const { renderScene, Player } = await import('/src/engine.ts');
    const svg = renderScene(input);
    document.body.append(svg);
    const player = new Player(svg, input);
    player.seek(3.75);
    const erasingTime = player.currentTime;
    player.play();
    const playing = player.isPlaying;
    player.seek(10);
    const stopped = !player.isPlaying && svg.animationsPaused();
    const end = player.currentTime;
    player.play();
    const replayed = player.currentTime < 0.1;
    player.destroy();
    input.settings.loop = true;
    const loopingSvg = renderScene(input);
    document.body.append(loopingSvg);
    const looping = new Player(loopingSvg, input);
    loopingSvg.setCurrentTime(5);
    const blankHold = looping.currentTime;
    loopingSvg.setCurrentTime(5.75);
    const nextCycle = looping.currentTime;
    looping.destroy();
    return { erasingTime, playing, stopped, end, replayed, blankHold, nextCycle };
  }, scene);
  expect(result).toEqual({ erasingTime: 3.75, playing: true, stopped: true, end: 4.5, replayed: true, blankHold: 4.5, nextCycle: 0.5 });
});

test('real font timelines finish erasing without residual endpoint caps', async ({ page }) => {
  const remaining = await page.evaluate(async settings => {
    const { loadFont, createScene, renderScene, Player } = await import('/src/engine.ts');
    const { getTimeline } = await import('/src/timeline.ts');
    const results = [];
    for (const fontId of ['satisfy', 'caveat']) {
      const font = await loadFont(`/fonts/${fontId}.json`);
      const scene = createScene(font, 'Ink', { ...settings, fontId, holdDuration: 0 });
      const svg = renderScene(scene);
      document.body.append(svg);
      const player = new Player(svg, scene);
      player.seek(getTimeline(scene).duration);
      results.push([...svg.querySelectorAll('path')].filter(path => Number(getComputedStyle(path).opacity) > 0).length);
      player.destroy();
      svg.remove();
    }
    return results;
  }, scene.settings);
  expect(remaining).toEqual([0, 0]);
});

test('erasing speed stays independent of writing speed without changing either hold', async ({ page }) => {
  const results = await page.evaluate(async settings => {
    const { loadFont, createScene, renderScene, Player } = await import('/src/engine.ts');
    const { getTimeline } = await import('/src/timeline.ts');
    const results = [];
    for (const fontId of ['satisfy', 'caveat']) {
      const font = await loadFont(`/fonts/${fontId}.json`);
      for (const speed of [0.5, 2]) {
        const scene = createScene(font, 'Ink', { ...settings, fontId, speed, eraseSpeed: 2 });
        const timeline = getTimeline(scene);
        const svg = renderScene(scene);
        document.body.append(svg);
        const player = new Player(svg, scene);
        player.seek(timeline.duration);
        results.push({
          writing: scene.duration, erasing: timeline.duration - timeline.eraseStart!,
          hold: timeline.eraseStart! - scene.duration, blank: timeline.finalHold,
          remaining: [...svg.querySelectorAll('path')].filter(path => Number(getComputedStyle(path).opacity) > 0).length,
        });
        player.destroy();
        svg.remove();
      }
    }
    return results;
  }, scene.settings);
  for (let index = 0; index < results.length; index += 2) {
    expect(results[index].writing).toBeCloseTo(results[index + 1].writing * 4, 6);
    expect(results[index].erasing).toBeCloseTo(results[index + 1].erasing, 6);
    expect(results[index].erasing).toBeCloseTo(results[index + 1].writing, 6);
  }
  for (const result of results) {
    expect(result.hold).toBeCloseTo(0.5, 6);
    expect(result.blank).toBe(0.75);
    expect(result.remaining).toBe(0);
  }
});

test('PNG retains the completed drawing when erasing is enabled', async ({ page }) => {
  const ink = await page.evaluate(async input => {
    const { exportFormats } = await import('/src/export.ts');
    const bitmap = await createImageBitmap(await exportFormats.png.serialize(input, 'static'));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return [[30, 40], [60, 40], [30, 70], [60, 70]].map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]);
  }, scene);
  expect(ink).toEqual([255, 255, 255, 255]);
});

for (const eraseSpeed of [1, 2]) {
  test(`GIF encodes both holds and progressive erasing with transparent frame disposal at eraseSpeed=${eraseSpeed}`, async ({ page }) => {
    const result = await page.evaluate(async ({ input, eraseSpeed }) => {
      const { exportFormats } = await import('/src/export.ts');
      input.settings.loop = true;
      input.settings.eraseSpeed = eraseSpeed;
      const blob = await exportFormats.gif.serialize(input, 'animated');
      const data = await blob.arrayBuffer();
      const decoder = new ImageDecoder({ data, type: blob.type });
      await decoder.tracks.ready;
      const frameCount = decoder.tracks.selectedTrack!.frameCount;
      const canvas = document.createElement('canvas');
      canvas.width = input.width;
      canvas.height = input.height;
      const context = canvas.getContext('2d')!;
      const samples = [];
      for (const frameIndex of [0, 10, 45, Math.round((2.5 + 0.25 / eraseSpeed) * 20), Math.round((2.5 + 1.25 / eraseSpeed) * 20), frameCount - 1]) {
        const { image } = await decoder.decode({ frameIndex });
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        samples.push({
          timestamp: image.timestamp, duration: image.duration,
          ink: [[30, 40], [60, 40], [30, 70], [60, 70]].map(([x, y]) => context.getImageData(x, y, 1, 1).data[3] > 0),
        });
        image.close();
      }
      decoder.close();
      return { frameCount, samples, repeats: new TextDecoder().decode(data).includes('NETSCAPE2.0') };
    }, { input: scene, eraseSpeed });
    expect(result.frameCount).toBe(Math.ceil((2.5 + 2 / eraseSpeed) * 20) + 1);
    expect(result.repeats).toBe(true);
    expect(result.samples.map(sample => sample.timestamp)).toEqual([0, 0.5, 2.25, 2.5 + 0.25 / eraseSpeed, 2.5 + 1.25 / eraseSpeed, 2.5 + 2 / eraseSpeed].map(time => Math.round(time * 20) * 50000));
    expect(result.samples.at(-1)!.duration).toBe(750000);
    expect(result.samples.map(sample => sample.ink)).toEqual([
      [false, false, false, false], [true, false, false, false], [true, true, true, true],
      [false, true, true, true], [false, false, false, true], [false, false, false, false],
    ]);
  });
}
