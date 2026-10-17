import { t } from './i18n';
import { fonts } from './fonts';
import { brushSegmentPath, brushStampPath } from './brush';
import { getTimeline } from './timeline';
import type { Scene, Stroke } from './types';

export type ExportMode = 'animated' | 'static';

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

function loopAnimation(attribute: string, frames: [number, string][], cycle: number, mode: 'linear' | 'discrete'): string {
  if (frames.at(-1)![0] < cycle) frames.push([cycle, frames.at(-1)![1]]);
  // Zero-length holds share a boundary with the adjacent motion.
  const points = frames.filter((frame, index) => !index || frame[0] !== frames[index - 1][0]);
  return `      <animate attributeName="${attribute}" values="${points.map(point => point[1]).join(';')}" keyTimes="${points.map(point => number(point[0] / cycle)).join(';')}" calcMode="${mode}" begin="0s" dur="${number(cycle)}s" repeatCount="indefinite"/>\n`;
}

function animatedPath(attributes: string, start: number, end: number, loop: boolean, cycle: number, motion?: { attribute: string; from: string; to: string; erased: string }, eraseStart?: number): string {
  const reveal = Math.max(start, 0.0001);
  const hide = eraseStart === undefined ? undefined : eraseStart + (motion ? end : start);
  const initial = motion ? ` ${motion.attribute}="${motion.from}"` : '';
  let markup = `    <path ${attributes}${initial} opacity="0">\n`;
  if (!loop) {
    markup += `      <set attributeName="opacity" to="1" begin="${number(reveal)}s" fill="freeze"/>\n`;
    if (hide !== undefined) markup += `      <set attributeName="opacity" to="0" begin="${number(hide)}s" fill="freeze"/>\n`;
    if (motion) markup += `      <animate attributeName="${motion.attribute}" from="${motion.from}" to="${motion.to}" begin="${number(start)}s" dur="${number(end - start)}s" calcMode="linear" fill="freeze"/>\n`;
    if (motion && eraseStart !== undefined) markup += `      <animate attributeName="${motion.attribute}" from="${motion.to}" to="${motion.erased}" begin="${number(eraseStart + start)}s" dur="${number(end - start)}s" calcMode="linear" fill="freeze"/>\n`;
  } else {
    const opacity: [number, string][] = [[0, '0'], [reveal, '1']];
    if (hide !== undefined) opacity.push([hide, '0']);
    markup += loopAnimation('opacity', opacity, cycle, 'discrete');
    if (motion) {
      const frames: [number, string][] = [[0, motion.from], [start, motion.from], [end, motion.to]];
      if (eraseStart !== undefined) frames.push([eraseStart + start, motion.to], [eraseStart + end, motion.erased]);
      markup += loopAnimation(motion.attribute, frames, cycle, 'linear');
    }
  }
  return markup + '    </path>\n';
}

function brushSvg(stroke: Stroke, scene: Scene, mode: ExportMode, timeline: ReturnType<typeof getTimeline>, time?: number): string {
  const { cycle, eraseStart } = timeline;
  const brush = stroke.brush!;
  const { start, end } = times(stroke);
  const paths: string[] = [];
  const complete = mode === 'static' && time === undefined;
  const eraseTime = time !== undefined && eraseStart !== undefined ? time - eraseStart : undefined;
  for (const segment of brush.segments) {
    const pieceStart = start + (end - start) * segment.start;
    const pieceEnd = start + (end - start) * segment.end;
    if (complete) {
      paths.push(`    <path d="${brushSegmentPath(segment)}"/>\n`);
    } else if (time !== undefined) {
      if (time >= Math.max(pieceStart, 0.0001) && (eraseTime === undefined || eraseTime < pieceEnd)) {
        const progress = Math.min(1, Math.max(0, (time - pieceStart) / (pieceEnd - pieceStart)));
        const erased = eraseTime === undefined ? 0 : Math.min(1, Math.max(0, (eraseTime - pieceStart) / (pieceEnd - pieceStart)));
        paths.push(`    <path d="${brushSegmentPath(segment, progress, erased)}"/>\n`);
      }
    } else {
      paths.push(animatedPath('', pieceStart, pieceEnd, scene.settings.loop, cycle, {
        attribute: 'd', from: brushSegmentPath(segment, 0), to: brushSegmentPath(segment), erased: brushSegmentPath(segment, 1, 1),
      }, eraseStart));
    }
  }
  for (const stamp of brush.stamps) {
    // Keep endpoint terminals visible when a browser clock rounds the final time.
    const reveal = Math.max(start, start + (end - start) * stamp.at - 0.000001);
    const attributes = `d="${brushStampPath(stamp)}"`;
    if (complete || (time !== undefined && time >= Math.max(reveal, 0.0001) && (eraseStart === undefined || time < eraseStart + reveal))) paths.push(`    <path ${attributes}/>\n`);
    else if (time === undefined) paths.push(animatedPath(attributes, reveal, end, scene.settings.loop, cycle, undefined, eraseStart));
  }
  return `  <g transform="${xml(stroke.transform)}" fill="${color(scene.settings.color, FALLBACK_INK)}" stroke="none">\n${paths.join('')}  </g>\n`;
}

function pathSvg(stroke: Stroke, scene: Scene, mode: ExportMode, timeline: ReturnType<typeof getTimeline>, time?: number): string {
  if (stroke.brush) return brushSvg(stroke, scene, mode, timeline, time);
  const { cycle, eraseStart } = timeline;
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
    const erased = eraseStart === undefined ? 0 : Math.min(1, Math.max(0, (time - eraseStart - start) / (end - start)));
    const visible = time >= Math.max(start, 0.0001) && (eraseStart === undefined || time < eraseStart + end);
    return `    <path ${attributes} ${dashAttributes} stroke-dashoffset="${number((length + clearance) * (1 - progress - erased))}" opacity="${visible ? 1 : 0}"/>\n`;
  }
  return animatedPath(`${attributes} ${dashAttributes}`, start, end, scene.settings.loop, cycle, {
    attribute: 'stroke-dashoffset', from: hiddenOffset, to: '0', erased: `-${hiddenOffset}`,
  }, eraseStart);
}

/** Self-contained SVG. A time samples a still frame of the same stroke timeline. */
export function exportSvg(scene: Scene, mode: ExportMode = 'animated', time?: number): string {
  const width = number(positive(scene.width));
  const height = number(positive(scene.height));
  const ink = color(scene.settings.color, FALLBACK_INK);
  const strokeWidth = number(positive(scene.settings.strokeWidth, 2) / positive(scene.scale));
  const timeline = getTimeline(scene);
  const title = scene.text.trim() ? scene.text : t('app.title');
  const font = fonts.find(item => item.id === scene.settings.fontId) ?? fonts[0];
  const background = scene.settings.background === 'transparent'
    ? ''
    : `  <rect width="${width}" height="${height}" fill="${color(scene.settings.background, '#ffffff')}"/>\n`;

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="inkmotion-title inkmotion-desc">\n`
    + `  <title id="inkmotion-title">${xml(title)}</title>\n`
    + `  <desc id="inkmotion-desc">${xml(t(mode === 'animated' ? 'export.animatedDescription' : 'export.staticDescription', { font: font.name, source: font.source.name }))}</desc>\n`
    + `  <metadata>Created with InkMotion. Font paths: ${xml(font.name)} from ${xml(font.source.name)}, ${xml(font.source.url)}.</metadata>\n`
    + background
    + `  <g fill="none" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">\n`
    + scene.strokes.map((stroke) => pathSvg(stroke, scene, mode, timeline, time)).join('')
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
