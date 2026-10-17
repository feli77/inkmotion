import type { Scene } from './types';

export const DEFAULT_HOLD_SECONDS = 1;

export function holdSeconds(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(30, Math.max(0, value)) : DEFAULT_HOLD_SECONDS;
}

/** One shared clock for SVG playback, seeking and sampled export frames. */
export function getTimeline(scene: Scene) {
  const writingDuration = scene.strokes.reduce(
    (latest, stroke) => Math.max(latest, Number.isFinite(stroke.end) ? stroke.end : 0),
    Number.isFinite(scene.duration) ? Math.max(0, scene.duration) : 0,
  );
  const eraseStart = scene.settings.erase && writingDuration > 0
    ? writingDuration + holdSeconds(scene.settings.holdDuration) : undefined;
  const duration = eraseStart === undefined ? writingDuration : eraseStart + writingDuration;
  const finalHold = eraseStart === undefined ? DEFAULT_HOLD_SECONDS : holdSeconds(scene.settings.blankDuration);
  return { writingDuration, eraseStart, duration, finalHold, cycle: duration + finalHold };
}
