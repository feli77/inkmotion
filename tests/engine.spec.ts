import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('all printable ASCII stays inside the canvas, including thick strokes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { loadFont, createScene, renderScene } = await import('/src/engine.ts');
    const font = await loadFont('/fonts/satisfy.json');
    const settings = {
      fontId: 'satisfy', fontSize: 56, strokeWidth: 12, speed: 1,
      color: '#252832', lineHeight: 1.65, alignment: 'right' as const,
      background: 'transparent', loop: false, width: 280, padding: 24,
    };
    const text = Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join('');
    const scene = createScene(font, text, settings);
    const svg = renderScene(scene);
    document.body.append(svg);
    const box = svg.querySelector('g')!.getBBox();
    const margin = settings.strokeWidth / 2;
    const bounds = {
      left: box.x - margin, top: box.y - margin,
      right: box.x + box.width + margin, bottom: box.y + box.height + margin,
    };
    svg.remove();
    return { unsupported: scene.unsupported, width: scene.width, height: scene.height, count: scene.strokes.length, bounds };
  });
  expect(result.unsupported).toEqual([]);
  expect(result.count).toBeGreaterThan(94);
  expect(result.bounds.left).toBeGreaterThanOrEqual(0);
  expect(result.bounds.top).toBeGreaterThanOrEqual(0);
  expect(result.bounds.right).toBeLessThanOrEqual(result.width);
  expect(result.bounds.bottom).toBeLessThanOrEqual(result.height);
});

test('word wrapping, long-word splitting and blank lines retain every stroke', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { loadFont, createScene } = await import('/src/engine.ts');
    const font = await loadFont('/fonts/satisfy.json');
    const settings = {
      fontId: 'satisfy', fontSize: 56, strokeWidth: 1.8, speed: 1,
      color: '#252832', lineHeight: 1.65, alignment: 'left' as const,
      background: 'transparent', loop: false, width: 240, padding: 24,
    };
    const text = 'Hello world\n\nSupercalifragilisticexpialidocious';
    const narrow = createScene(font, text, settings);
    const wide = createScene(font, text, { ...settings, width: 2000 });
    const getBaselines = (scene: typeof narrow) => [...new Set(scene.strokes.map((stroke) =>
      Number(stroke.transform.match(/^translate\([^ ]+ ([^)]+)\)/)![1]),
    ))];
    return {
      narrowCount: narrow.strokes.length, wideCount: wide.strokes.length,
      narrowBaselines: getBaselines(narrow), wideBaselines: getBaselines(wide),
      narrowHeight: narrow.height, wideHeight: wide.height,
    };
  });
  expect(result.narrowCount).toEqual(result.wideCount);
  expect(result.narrowBaselines.length).toBeGreaterThan(result.wideBaselines.length);
  expect(result.narrowHeight).toBeGreaterThan(result.wideHeight);
  // A blank manual line makes the baseline gap greater than one line step.
  expect(result.wideBaselines[1] - result.wideBaselines[0]).toBeGreaterThan(150);
});

test('normalization, unsupported reporting and speed have predictable results', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { loadFont, createScene, normalizeText } = await import('/src/engine.ts');
    const font = await loadFont('/fonts/satisfy.json');
    const settings = {
      fontId: 'satisfy', fontSize: 56, strokeWidth: 1.8, speed: 1,
      color: '#252832', lineHeight: 1.65, alignment: 'left' as const,
      background: 'transparent', loop: false, width: 600, padding: 24,
    };
    const first = createScene(font, '“Hello”—it’s\u00a0me…\tA\r\n中🙂中', settings);
    const second = createScene(font, first.text, { ...settings, speed: 2 });
    return {
      normalized: normalizeText('“Hello”—it’s\u00a0me…\tA\r\n中🙂中'),
      unsupported: first.unsupported, duration: first.duration, fasterDuration: second.duration,
      strokeCount: first.strokes.length, fasterCount: second.strokes.length,
      ordered: first.strokes.every((stroke, index) => stroke.end > stroke.start && (!index || stroke.start > first.strokes[index - 1].end)),
    };
  });
  expect(result.normalized).toBe('"Hello"-it\'s me...    A\n中🙂中');
  expect(result.unsupported).toEqual(['中', '🙂']);
  expect(result.fasterCount).toEqual(result.strokeCount);
  expect(result.fasterDuration).toBeCloseTo(result.duration / 2, 8);
  expect(result.ordered).toBe(true);
});

test('SVG transport pauses, seeks, restarts and holds a completed loop', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { loadFont, createScene, renderScene, Player } = await import('/src/engine.ts');
    const font = await loadFont('/fonts/satisfy.json');
    const settings = {
      fontId: 'satisfy', fontSize: 56, strokeWidth: 1.8, speed: 1,
      color: '#252832', lineHeight: 1.65, alignment: 'left' as const,
      background: 'transparent', loop: false, width: 600, padding: 24,
    };
    const scene = createScene(font, 'Hello', settings);
    const svg = renderScene(scene);
    document.body.append(svg);
    const player = new Player(svg, scene);
    const initiallyPaused = svg.animationsPaused();
    player.seek(scene.duration / 2);
    const seekTime = player.currentTime;
    player.play();
    const playing = player.isPlaying;
    player.pause();
    const paused = !player.isPlaying && svg.animationsPaused();
    player.seek(scene.duration);
    const completed = player.currentTime;
    player.restart();
    const restarted = player.isPlaying && player.currentTime < 0.1;
    player.destroy();
    svg.remove();
    const loopScene = createScene(font, 'Hi', { ...settings, loop: true });
    const loopSvg = renderScene(loopScene);
    document.body.append(loopSvg);
    const loopPlayer = new Player(loopSvg, loopScene);
    loopSvg.setCurrentTime(loopScene.duration + 0.5);
    const heldTime = loopPlayer.currentTime;
    loopSvg.setCurrentTime(loopScene.duration + 1.25);
    const nextCycle = loopPlayer.currentTime;
    loopPlayer.destroy();
    loopSvg.remove();
    return { initiallyPaused, seekTime, duration: scene.duration, playing, paused, completed, restarted, heldTime, loopDuration: loopScene.duration, nextCycle };
  });
  expect(result.initiallyPaused).toBe(true);
  expect(result.seekTime).toBeCloseTo(result.duration / 2, 5);
  expect(result.playing).toBe(true);
  expect(result.paused).toBe(true);
  expect(result.completed).toBeCloseTo(result.duration, 5);
  expect(result.restarted).toBe(true);
  expect(result.heldTime).toBeCloseTo(result.loopDuration, 5);
  expect(result.nextCycle).toBeCloseTo(0.25, 5);
});
