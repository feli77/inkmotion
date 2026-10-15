import { exportSvg, LOOP_HOLD_SECONDS } from './export';
import type { Scene } from './types';

function createCanvas(scene: Scene): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(scene.width);
  canvas.height = Math.ceil(scene.height);
  return canvas;
}

async function drawSvg(context: CanvasRenderingContext2D, svg: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.drawImage(image, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(scene: Scene): Promise<Blob> {
  const canvas = createCanvas(scene);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  try {
    await drawSvg(context, exportSvg(scene, 'static'));
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** GIF has binary transparency; threshold alpha before creating or applying its palette. */
function gifPixels(context: CanvasRenderingContext2D, transparent: boolean): Uint8ClampedArray {
  const { data } = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  if (transparent) {
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) data[index] = data[index + 1] = data[index + 2] = data[index + 3] = 0;
      else data[index + 3] = 255;
    }
  }
  return data;
}

export async function exportGif(scene: Scene): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const canvas = createCanvas(scene);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable');
  if (canvas.width > 65535 || canvas.height > 65535) throw new Error('GIF dimensions are too large');
  try {
    const transparent = scene.settings.background === 'transparent';
    const format = transparent ? 'rgba4444' : 'rgb565';
    // A single palette from the completed drawing keeps colors stable across all frames.
    await drawSvg(context, exportSvg(scene, 'static'));
    const colors = quantize(gifPixels(context, transparent), transparent ? 255 : 256, { format });
    const palette = transparent ? [[0, 0, 0, 0], ...colors.filter(color => color[3] > 0)] : colors;
    const gif = GIFEncoder();
    const duration = scene.strokes.reduce((latest, stroke) => Math.max(latest, stroke.end), Math.max(0, scene.duration));
    // Aim for 20 fps. Bound work for long text while retaining its full playback duration.
    const frameCount = Math.max(1, Math.min(599, Math.ceil(duration * 20)));
    const totalTicks = Math.max(frameCount * 2, Math.round(duration * 100));
    for (let index = 0; index <= frameCount; index++) {
      const tick = Math.round(index * totalTicks / frameCount);
      const time = index === frameCount ? duration : Math.min(duration, tick / 100);
      await drawSvg(context, exportSvg(scene, 'animated', time));
      gif.writeFrame(applyPalette(gifPixels(context, transparent), palette, format), canvas.width, canvas.height, {
        palette: index === 0 ? palette : undefined,
        delay: index === frameCount ? LOOP_HOLD_SECONDS * 1000 : (Math.round((index + 1) * totalTicks / frameCount) - tick) * 10,
        repeat: scene.settings.loop ? 0 : -1,
        transparent,
        transparentIndex: 0,
        // Each frame covers the whole canvas; clear transparent frames before the next one.
        dispose: transparent ? 2 : 1,
      });
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
