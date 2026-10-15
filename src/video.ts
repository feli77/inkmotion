import { exportSvg, getVideoMimeType, LOOP_HOLD_SECONDS } from './export';
import { createCanvas, drawSvg } from './raster';
import type { Scene } from './types';

/** Record one writing cycle using native browser codecs, with an opaque background. */
export async function exportVideo(scene: Scene): Promise<Blob> {
  const mimeType = getVideoMimeType();
  if (!mimeType) throw new Error('Video export is unavailable');
  const videoScene: Scene = {
    ...scene,
    // H.264 encoders require even dimensions; pad without scaling the drawing.
    width: Math.ceil(scene.width / 2) * 2,
    height: Math.ceil(scene.height / 2) * 2,
    settings: { ...scene.settings, background: scene.settings.background === 'transparent' ? '#ffffff' : scene.settings.background },
  };
  const canvas = createCanvas(videoScene);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let disposed = false;
  try {
    await drawSvg(context, exportSvg(videoScene, 'animated', 0));
    stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const recording = recorder;
    const chunks: Blob[] = [];
    const result = new Promise<Blob>((resolve, reject) => {
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = () => reject(new Error('Video encoding failed'));
      recording.onstop = () => {
        if (chunks.length) resolve(new Blob(chunks, { type: recording.mimeType }));
        else reject(new Error('Video encoding produced no data'));
      };
    });
    const duration = scene.strokes.reduce((latest, stroke) => Math.max(latest, stroke.end), Math.max(0, scene.duration));
    const render = async (): Promise<void> => {
      recording.start();
      const started = performance.now();
      // Redraw during the final hold too, so the encoded video includes that pause.
      while (!disposed) {
        const elapsed = (performance.now() - started) / 1000;
        if (elapsed >= duration + LOOP_HOLD_SECONDS) break;
        if (recording.state !== 'recording') throw new Error('Video recording stopped early');
        const frameStarted = performance.now();
        await drawSvg(context, elapsed >= duration ? exportSvg(videoScene, 'static') : exportSvg(videoScene, 'animated', elapsed));
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 / 30 - (performance.now() - frameStarted))));
      }
      if (!disposed) recording.stop();
    };
    const [blob] = await Promise.all([result, render()]);
    return blob;
  } finally {
    disposed = true;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    canvas.width = canvas.height = 0;
  }
}
