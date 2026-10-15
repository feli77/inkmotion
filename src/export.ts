import { t } from './i18n';
import type { Scene, Stroke } from './types';

export type ExportMode = 'animated' | 'static';

/** All strokes share this pause before a looping animation starts again. */
export const LOOP_HOLD_SECONDS = 1;

/** An adapter can produce any file without changing the handwriting engine. */
export interface ExportAdapter {
  readonly id: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly mode?: ExportMode;
  serialize(scene: Scene, mode: ExportMode): Blob | Promise<Blob>;
}

const FALLBACK_INK = '#262832';
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

function xml(value: string): string {
  // XML 1.0 rejects control characters and isolated surrogate code units.
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD')
    .replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[character]!);
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value: number, fallback = 1): number {
  return value > 0 && Number.isFinite(value) ? value : fallback;
}

function number(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function color(value: string, fallback: string): string {
  // Restrict paint to plain colors: never serialize url(), style, or markup.
  return HEX_COLOR.test(value) ? value : fallback;
}

function times(stroke: Stroke): { start: number; end: number } {
  const start = Math.max(0, finite(stroke.start));
  return { start, end: Math.max(start + 0.0001, finite(stroke.end, start)) };
}

function pathSvg(stroke: Stroke, scene: Scene, mode: ExportMode, cycle: number, time?: number): string {
  const attributes = `d="${xml(stroke.d)}" transform="${xml(stroke.transform)}"`;
  if (mode === 'static' && time === undefined) return `    <path ${attributes}/>\n`;

  const length = positive(stroke.length, 0.001);
  // The extra gap keeps round caps hidden while a stroke is still waiting.
  const scale = positive(scene.scale);
  const clearance = positive(scene.settings.strokeWidth, 2) / scale + 2;
  const hiddenOffset = number(length + clearance);
  const { start, end } = times(stroke);
  const dashAttributes = `pathLength="${number(length)}" stroke-dasharray="${number(length)} ${number(length + 2 * clearance)}"`;
  if (time !== undefined) {
    // Sample the same linear reveal and waiting opacity used by the SMIL below.
    const progress = Math.min(1, Math.max(0, (time - start) / (end - start)));
    return `    <path ${attributes} ${dashAttributes} stroke-dashoffset="${number((length + clearance) * (1 - progress))}" opacity="${time >= Math.max(start, 0.0001) ? 1 : 0}"/>\n`;
  }
  const reveal = Math.max(start, 0.0001);
  const path = `    <path ${attributes} ${dashAttributes} stroke-dashoffset="${hiddenOffset}" opacity="0">\n`;

  if (!scene.settings.loop) {
    return path
      + `      <set attributeName="opacity" to="1" begin="${number(reveal)}s" fill="freeze"/>\n`
      + `      <animate attributeName="stroke-dashoffset" from="${hiddenOffset}" to="0" begin="${number(start)}s" dur="${number(end - start)}s" calcMode="linear" fill="freeze"/>\n`
      + '    </path>\n';
  }

  const dashValues = start > 0 ? `${hiddenOffset};${hiddenOffset};0;0` : `${hiddenOffset};0;0`;
  const dashTimes = start > 0
    ? `0;${number(start / cycle)};${number(end / cycle)};1`
    : `0;${number(end / cycle)};1`;
  const timing = `begin="0s" dur="${number(cycle)}s" repeatCount="indefinite"`;

  return path
    + `      <animate attributeName="opacity" values="0;1;1" keyTimes="0;${number(reveal / cycle)};1" calcMode="discrete" ${timing}/>\n`
    + `      <animate attributeName="stroke-dashoffset" values="${dashValues}" keyTimes="${dashTimes}" calcMode="linear" ${timing}/>\n`
    + '    </path>\n';
}

/** Self-contained SVG. A time samples a still frame of the same stroke timeline. */
export function exportSvg(scene: Scene, mode: ExportMode = 'animated', time?: number): string {
  const width = number(positive(scene.width));
  const height = number(positive(scene.height));
  const ink = color(scene.settings.color, FALLBACK_INK);
  const strokeWidth = number(positive(scene.settings.strokeWidth, 2) / positive(scene.scale));
  const duration = scene.strokes.reduce(
    (latest, stroke) => Math.max(latest, times(stroke).end),
    Math.max(0, finite(scene.duration)),
  );
  const cycle = duration + LOOP_HOLD_SECONDS;
  const title = scene.text.trim() ? scene.text : t('app.title');
  const background = scene.settings.background === 'transparent'
    ? ''
    : `  <rect width="${width}" height="${height}" fill="${color(scene.settings.background, '#ffffff')}"/>\n`;

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="inkmotion-title inkmotion-desc">\n`
    + `  <title id="inkmotion-title">${xml(title)}</title>\n`
    + `  <desc id="inkmotion-desc">${xml(t(mode === 'animated' ? 'export.animatedDescription' : 'export.staticDescription'))}</desc>\n`
    + '  <metadata>Created with InkMotion. Font paths: Satisfy from Vara.js, https://github.com/akzhy/Vara.</metadata>\n'
    + background
    + `  <g fill="none" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">\n`
    + scene.strokes.map((stroke) => pathSvg(stroke, scene, mode, cycle, time)).join('')
    + '  </g>\n</svg>\n';
}

export const exportFormats: Readonly<Record<string, ExportAdapter>> = Object.freeze({
  svg: Object.freeze({
    id: 'svg',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    serialize: (scene: Scene, mode: ExportMode) => new Blob([exportSvg(scene, mode)], { type: 'image/svg+xml;charset=utf-8' }),
  }),
  png: Object.freeze({
    id: 'png',
    extension: 'png',
    mimeType: 'image/png',
    mode: 'static',
    serialize: async (scene: Scene) => (await import('./raster')).exportPng(scene),
  }),
  gif: Object.freeze({
    id: 'gif',
    extension: 'gif',
    mimeType: 'image/gif',
    mode: 'animated',
    serialize: async (scene: Scene) => (await import('./raster')).exportGif(scene),
  }),
});

export async function downloadExport(scene: Scene, formatId = 'svg', mode: ExportMode = 'animated'): Promise<void> {
  const adapter = Object.hasOwn(exportFormats, formatId) ? exportFormats[formatId] : undefined;
  if (!adapter) throw new Error(`Unsupported export format: ${formatId}`);
  const resolvedMode = adapter.mode ?? mode;
  const blob = await adapter.serialize(scene, resolvedMode);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `inkmotion-${resolvedMode}.${adapter.extension}`;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
