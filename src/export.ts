import { t } from './i18n';
import { fonts } from './fonts';
import { brushSegmentPath, brushStampPath } from './brush';
import type { Scene, Stroke } from './types';

export type ExportMode = 'animated' | 'static';

/** All strokes share this pause before a looping animation starts again. */
export const LOOP_HOLD_SECONDS = 1;

export function getVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return;
  return [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].find(type => MediaRecorder.isTypeSupported(type));
}

/** An adapter can produce any file without changing the handwriting engine. */
export interface ExportAdapter {
  readonly id: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly mode?: ExportMode;
  serialize(scene: Scene, mode: ExportMode): Blob | Promise<Blob>;
}

const FALLBACK_INK = '#262832';
const OUTLINE_REFERENCE_WIDTH = 1.8;
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

function times(stroke: Pick<Stroke, 'start' | 'end'>): { start: number; end: number } {
  const start = Math.max(0, finite(stroke.start));
  return { start, end: Math.max(start + 0.0001, finite(stroke.end, start)) };
}

function animatedPath(attributes: string, start: number, end: number, loop: boolean, cycle: number, motion?: { attribute: string; from: string; to: string }): string {
  const reveal = Math.max(start, 0.0001);
  const initial = motion ? ` ${motion.attribute}="${motion.from}"` : '';
  let markup = `    <path ${attributes}${initial} opacity="0">\n`;
  if (!loop) {
    markup += `      <set attributeName="opacity" to="1" begin="${number(reveal)}s" fill="freeze"/>\n`;
    if (motion) markup += `      <animate attributeName="${motion.attribute}" from="${motion.from}" to="${motion.to}" begin="${number(start)}s" dur="${number(end - start)}s" calcMode="linear" fill="freeze"/>\n`;
  } else {
    const timing = `begin="0s" dur="${number(cycle)}s" repeatCount="indefinite"`;
    markup += `      <animate attributeName="opacity" values="0;1;1" keyTimes="0;${number(reveal / cycle)};1" calcMode="discrete" ${timing}/>\n`;
    if (motion) {
      const values = start > 0 ? `${motion.from};${motion.from};${motion.to};${motion.to}` : `${motion.from};${motion.to};${motion.to}`;
      const keyTimes = start > 0 ? `0;${number(start / cycle)};${number(end / cycle)};1` : `0;${number(end / cycle)};1`;
      markup += `      <animate attributeName="${motion.attribute}" values="${values}" keyTimes="${keyTimes}" calcMode="linear" ${timing}/>\n`;
    }
  }
  return markup + '    </path>\n';
}

function brushSvg(stroke: Stroke, scene: Scene, mode: ExportMode, cycle: number, time?: number): string {
  const brush = stroke.brush!;
  const { start, end } = times(stroke);
  const paths: string[] = [];
  const complete = mode === 'static' && time === undefined;
  for (const segment of brush.segments) {
    const pieceStart = start + (end - start) * segment.start;
    const pieceEnd = start + (end - start) * segment.end;
    if (complete || (time !== undefined && time >= pieceEnd)) {
      paths.push(`    <path d="${brushSegmentPath(segment)}"/>\n`);
    } else if (time !== undefined) {
      if (time >= Math.max(pieceStart, 0.0001)) {
        const progress = Math.max(0, (time - pieceStart) / (pieceEnd - pieceStart));
        paths.push(`    <path d="${brushSegmentPath(segment, progress)}"/>\n`);
      }
    } else {
      paths.push(animatedPath('', pieceStart, pieceEnd, scene.settings.loop, cycle, {
        attribute: 'd', from: brushSegmentPath(segment, 0), to: brushSegmentPath(segment),
      }));
    }
  }
  for (const stamp of brush.stamps) {
    // Keep endpoint terminals visible when a browser clock rounds the final time.
    const reveal = Math.max(start, start + (end - start) * stamp.at - 0.000001);
    const attributes = `d="${brushStampPath(stamp)}"`;
    if (complete || (time !== undefined && time >= Math.max(reveal, 0.0001))) paths.push(`    <path ${attributes}/>\n`);
    else if (time === undefined) paths.push(animatedPath(attributes, reveal, end, scene.settings.loop, cycle));
  }
  return `  <g transform="${xml(stroke.transform)}" fill="${color(scene.settings.color, FALLBACK_INK)}" stroke="none">\n${paths.join('')}  </g>\n`;
}

function outlineSvg(stroke: Stroke, scene: Scene, mode: ExportMode, cycle: number, index: number, time?: number): string {
  const outline = stroke.outline!;
  const id = `inkmotion-reveal-${index}`;
  const filter = Math.abs(scene.settings.strokeWidth - OUTLINE_REFERENCE_WIDTH) > 0.0001 ? ' filter="url(#inkmotion-outline-width)"' : '';
  const attributes = `d="${xml(outline.d)}" fill="${color(scene.settings.color, FALLBACK_INK)}" stroke="none"`;
  const complete = (mode === 'static' && time === undefined) || (time !== undefined && time >= stroke.end);
  let content = `    <path ${attributes}${complete ? '' : ` mask="url(#${id})"`}/>\n`;
  if (!complete) {
    const reveal = pathSvg({ ...stroke, transform: '', outline: undefined }, {
      ...scene, settings: { ...scene.settings, strokeWidth: outline.width * scene.scale },
    }, mode, cycle, index, time);
    content = `    <defs><mask id="${id}" x="-100%" y="-100%" width="300%" height="300%" style="mask-type:alpha">\n`
      + `      <g fill="none" stroke="#ffffff" stroke-width="${number(outline.width)}" stroke-linecap="round" stroke-linejoin="round">\n${reveal}      </g>\n`
      + `    </mask></defs>\n${content}`;
  }
  return `  <g transform="${xml(stroke.transform)}"${filter}>\n${content}  </g>\n`;
}

function pathSvg(stroke: Stroke, scene: Scene, mode: ExportMode, cycle: number, index: number, time?: number): string {
  if (stroke.outline) return outlineSvg(stroke, scene, mode, cycle, index, time);
  if (stroke.brush) return brushSvg(stroke, scene, mode, cycle, time);
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
  return animatedPath(`${attributes} ${dashAttributes}`, start, end, scene.settings.loop, cycle, {
    attribute: 'stroke-dashoffset', from: hiddenOffset, to: '0',
  });
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
  const font = fonts.find(item => item.id === scene.settings.fontId) ?? fonts[0];
  const fallback = font.fallbackSource ? ` Latin fallback: ${font.fallbackSource.font} from ${font.fallbackSource.name}, ${font.fallbackSource.url}. Chinese data: Arphic Public License, /fonts/LICENSE-Chinese-Kaiti.txt. InkMotion conversion, 2026-10-16: inverted Y and added centerline reveals.` : '';
  const difference = scene.settings.strokeWidth - OUTLINE_REFERENCE_WIDTH;
  const outlineFilter = scene.strokes.some(stroke => stroke.outline) && Math.abs(difference) > 0.0001
    ? `  <defs><filter id="inkmotion-outline-width" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feMorphology operator="${difference > 0 ? 'dilate' : 'erode'}" radius="${number(Math.abs(difference) / (2 * positive(scene.scale)))}"/></filter></defs>\n`
    : '';
  const background = scene.settings.background === 'transparent'
    ? ''
    : `  <rect width="${width}" height="${height}" fill="${color(scene.settings.background, '#ffffff')}"/>\n`;

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="inkmotion-title inkmotion-desc">\n`
    + `  <title id="inkmotion-title">${xml(title)}</title>\n`
    + `  <desc id="inkmotion-desc">${xml(t(mode === 'animated' ? 'export.animatedDescription' : 'export.staticDescription', { font: font.name, source: font.source.name }))}</desc>\n`
    + `  <metadata>Created with InkMotion. Font paths: ${xml(font.name)} from ${xml(font.source.name)}, ${xml(font.source.url)}.${xml(fallback)}</metadata>\n`
    + outlineFilter
    + background
    + `  <g fill="none" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">\n`
    + scene.strokes.map((stroke, index) => pathSvg(stroke, scene, mode, cycle, index, time)).join('')
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
  video: Object.freeze({
    id: 'video',
    get extension() { return getVideoMimeType()?.startsWith('video/mp4') ? 'mp4' : 'webm'; },
    get mimeType() { return getVideoMimeType() ?? 'video/webm'; },
    mode: 'animated',
    serialize: async (scene: Scene) => (await import('./video')).exportVideo(scene),
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
