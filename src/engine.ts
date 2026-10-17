import { exportSvg } from './export';
import { getTimeline, holdSeconds } from './timeline';
import { createBrush } from './brush';
import type { BrushGeometry, FontData, FontGlyph, FontPath, RenderSettings, Scene, Stroke } from './types';

export type { FontData, RenderSettings, Scene, Stroke } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const fontRequests = new Map<string, Promise<FontData>>();
const metricCache = new WeakMap<FontData, FontMetrics>();

interface MeasuredPath extends FontPath {
  length: number;
  brush?: BrushGeometry;
}

interface GlyphMetrics {
  paths: MeasuredPath[];
  left: number;
  top: number;
  bottom: number;
  width: number;
}

interface FontMetrics {
  glyphs: Map<string, GlyphMetrics>;
  top: number;
  bottom: number;
  widthScale: number;
  overhang: number;
}

interface PositionedCharacter {
  character: string;
  x: number;
  glyph?: GlyphMetrics;
}

interface Line {
  characters: PositionedCharacter[];
  width: number;
}

/** Font downloads are shared, while failures remain retryable. */
export function loadFont(url: string): Promise<FontData> {
  const existing = fontRequests.get(url);
  if (existing) return existing;
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Font request failed (${response.status})`);
      const value: unknown = await response.json();
      if (!isFontData(value)) throw new Error('Invalid stroke font');
      return value;
    })
    .catch((error: unknown) => {
      fontRequests.delete(url);
      throw error;
    });
  fontRequests.set(url, request);
  return request;
}

function isFontData(value: unknown): value is FontData {
  if (!value || typeof value !== 'object') return false;
  const font = value as Partial<FontData>;
  if (!font.c || !font.p || !(font.p.tf > 0) || !Number.isFinite(font.p.tf) || !(font.p.space > 0) || !Number.isFinite(font.p.space)) return false;
  if (font.p.preserveBearings !== undefined && typeof font.p.preserveBearings !== 'boolean') return false;
  return Object.values(font.c).every((glyph: FontGlyph) =>
    Number.isFinite(glyph.w) && Array.isArray(glyph.paths) && glyph.paths.every((path) =>
      typeof path.d === 'string' && Number.isFinite(path.mx) && Number.isFinite(path.my)
        && (path.points === undefined || (font.p!.bsw > 0 && Number.isFinite(font.p!.bsw)
          && Array.isArray(path.points) && path.points.length > 0
          && path.points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite) && point[2] >= 0)))
        && (path.nibs === undefined || (path.points !== undefined && Array.isArray(path.nibs)
          && path.nibs.every(nib => Array.isArray(nib) && nib.length === 6 && nib.every(Number.isFinite)
            && Number.isInteger(nib[0]) && nib[0] >= 0 && nib[0] < path.points!.length && nib[3] > 0 && nib[4] > 0))),
    ),
  );
}

/** Common typographic English punctuation maps to the font's ASCII glyphs. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00a0\u202f]/g, ' ');
}

function finiteClamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function sanitizeSettings(settings: RenderSettings): RenderSettings {
  const width = finiteClamp(settings.width, 128, 8192, 640);
  return {
    ...settings,
    width,
    fontSize: finiteClamp(settings.fontSize, 8, 240, 56),
    strokeWidth: finiteClamp(settings.strokeWidth, 0.2, 24, 1.8),
    speed: finiteClamp(settings.speed, 0.1, 10, 1),
    lineHeight: finiteClamp(settings.lineHeight, 0.8, 3, 1.65),
    padding: finiteClamp(settings.padding, 0, width / 2 - 1, 32),
    alignment: ['left', 'center', 'right'].includes(settings.alignment) ? settings.alignment : 'left',
    erase: settings.erase === true,
    holdDuration: holdSeconds(settings.holdDuration),
    blankDuration: holdSeconds(settings.blankDuration),
  };
}

function measureFont(font: FontData, widthScale: number): FontMetrics {
  const cached = metricCache.get(font);
  if (cached?.widthScale === widthScale) return cached;
  // An attached, hidden SVG gives consistent getBBox results across browsers.
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.append(svg);
  const glyphs = new Map<string, GlyphMetrics>();
  let top = 0;
  let bottom = 0;
  let overhang = 0;
  try {
    for (const [code, source] of Object.entries(font.c)) {
      let left = Infinity;
      let right = -Infinity;
      let glyphTop = Infinity;
      let glyphBottom = -Infinity;
      const paths = source.paths.map((sourcePath) => {
        if (sourcePath.points) {
          const brush = createBrush(sourcePath.points, sourcePath.nibs ?? [], widthScale);
          left = Math.min(left, brush.bounds.left + sourcePath.mx);
          right = Math.max(right, brush.bounds.right + sourcePath.mx);
          glyphTop = Math.min(glyphTop, brush.bounds.top - sourcePath.my);
          glyphBottom = Math.max(glyphBottom, brush.bounds.bottom - sourcePath.my);
          return { ...sourcePath, length: brush.length, brush };
        }
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', sourcePath.d);
        svg.append(path);
        const box = path.getBBox();
        const length = path.getTotalLength();
        path.remove();
        // getBBox excludes a path's own transform; apply Vara's mx / -my here.
        left = Math.min(left, box.x + sourcePath.mx);
        right = Math.max(right, box.x + box.width + sourcePath.mx);
        glyphTop = Math.min(glyphTop, box.y - sourcePath.my);
        glyphBottom = Math.max(glyphBottom, box.y + box.height - sourcePath.my);
        return { ...sourcePath, length };
      });
      if (!paths.length) continue;
      glyphs.set(String.fromCodePoint(Number(code)), {
        paths,
        left,
        top: glyphTop,
        bottom: glyphBottom,
        width: font.p.preserveBearings ? source.w : Math.max(right - left, source.w),
      });
      overhang = Math.max(overhang, -left, right - source.w);
      top = Math.min(top, glyphTop);
      bottom = Math.max(bottom, glyphBottom);
    }
  } finally {
    svg.remove();
  }
  const metrics = { glyphs, top, bottom, widthScale, overhang };
  metricCache.set(font, metrics);
  return metrics;
}

/** Layout and time allocation are deterministic for a font, text and settings. */
export function createScene(font: FontData, input: string, initialSettings: RenderSettings): Scene {
  const settings = sanitizeSettings(initialSettings);
  const scale = settings.fontSize / font.p.tf;
  const variableWidth = Object.values(font.c).some(glyph => glyph.paths.some(path => path.points));
  const metrics = measureFont(font, variableWidth ? settings.strokeWidth / (scale * font.p.bsw) : 0);
  const normalized = normalizeText(input);
  const unsupported = [...new Set([...normalized].filter((character) =>
    character !== ' ' && character !== '\n' && !metrics.glyphs.has(character),
  ))];
  // Unsupported text stays visible as '?' and is separately reported to the UI.
  const text = [...normalized].map((character) =>
    character === ' ' || character === '\n' || metrics.glyphs.has(character) ? character : '?',
  ).join('');
  const preserveBearings = font.p.preserveBearings === true;
  const margin = settings.strokeWidth / 2 + 1 + (preserveBearings ? metrics.overhang * scale : 0);
  const gap = preserveBearings ? 0 : Math.max(0.5 * scale, settings.strokeWidth * 0.35);
  const minAdvance = settings.fontSize * 0.055 + settings.strokeWidth;
  const getGlyph = (character: string): GlyphMetrics | undefined => metrics.glyphs.get(character);
  const characterWidth = (character: string): number => {
    if (character === ' ') return font.p.space * scale;
    const glyph = getGlyph(character);
    return glyph ? (preserveBearings ? glyph.width * scale : Math.max(glyph.width * scale, minAdvance) + gap) : font.p.space * scale;
  };
  const largestCharacter = Math.max(0, ...[...new Set([...text])].map(characterWidth));
  // If a single character exceeds a narrow canvas, expand the viewBox; the UI's
  // responsive SVG scales it down rather than clipping or silently losing text.
  const width = Math.max(settings.width, largestCharacter + settings.padding * 2 + margin * 2);
  const availableWidth = width - settings.padding * 2 - margin * 2;
  const lines: Line[] = [];
  let line: Line = { characters: [], width: 0 };
  const finishLine = (): void => {
    lines.push(line);
    line = { characters: [], width: 0 };
  };
  const appendCharacter = (character: string): void => {
    const advance = characterWidth(character);
    if (line.width > 0 && line.width + advance > availableWidth + 0.001) finishLine();
    line.characters.push({ character, x: line.width, glyph: getGlyph(character) });
    line.width += advance;
  };
  const appendSpaces = (spaces: string): void => {
    for (const character of spaces) appendCharacter(character);
  };
  const paragraphs = text.split('\n');
  for (const paragraph of paragraphs) {
    let pendingSpaces = '';
    for (const token of paragraph.match(/ +|[^ ]+/g) ?? []) {
      if (token[0] === ' ') {
        pendingSpaces += token;
        continue;
      }
      const wordWidth = [...token].reduce((sum, character) => sum + characterWidth(character), 0);
      const spaceWidth = pendingSpaces.length * characterWidth(' ');
      if (line.characters.length && line.width + spaceWidth + wordWidth > availableWidth) {
        finishLine();
        pendingSpaces = ''; // An automatic break replaces the word separator.
      }
      appendSpaces(pendingSpaces);
      pendingSpaces = '';
      for (const character of token) appendCharacter(character);
    }
    // Keep intentional indentation and trailing whitespace without creating
    // extra empty lines solely for spaces that overflow the canvas.
    for (const character of pendingSpaces) {
      if (line.width + characterWidth(character) > availableWidth) break;
      appendCharacter(character);
    }
    finishLine();
  }
  const lineStep = Math.max(settings.fontSize * settings.lineHeight, (metrics.bottom - metrics.top) * scale + settings.strokeWidth);
  const baseline = settings.padding + margin - metrics.top * scale;
  const height = Math.ceil(settings.padding * 2 + margin * 2 +
    Math.max(settings.fontSize, (metrics.bottom - metrics.top) * scale) + Math.max(0, lines.length - 1) * lineStep);
  const strokes: Stroke[] = [];
  let time = 0;
  const pixelsPerSecond = 210 * settings.speed;
  for (const [lineIndex, currentLine] of lines.entries()) {
    const alignOffset = settings.alignment === 'center' ? (availableWidth - currentLine.width) / 2
      : settings.alignment === 'right' ? availableWidth - currentLine.width : 0;
    for (const { character, x, glyph } of currentLine.characters) {
      if (!glyph) {
        time += 0.075 / settings.speed;
        continue;
      }
      const glyphAdvance = characterWidth(character) - gap;
      const extraWidth = (glyphAdvance - glyph.width * scale) / 2;
      const originX = settings.padding + margin + alignOffset + x + (preserveBearings ? 0 : extraWidth - glyph.left * scale);
      const originY = baseline + lineIndex * lineStep;
      for (const path of glyph.paths) {
        if (path.length <= 0) continue;
        const duration = Math.max(0.018 / settings.speed, path.length * scale / pixelsPerSecond);
        strokes.push({
          d: path.d,
          transform: `translate(${originX} ${originY}) scale(${scale}) translate(${path.mx} ${-path.my})`,
          length: path.length,
          start: time,
          end: time + duration,
          ...(path.brush ? { brush: path.brush } : {}),
        });
        time += duration + 0.018 / settings.speed;
      }
      time += (/[.,!?:;]/.test(character) ? 0.15 : 0.035) / settings.speed;
    }
    if (lineIndex < lines.length - 1) time += 0.16 / settings.speed;
  }
  return {
    width: Math.ceil(width),
    height,
    strokes,
    duration: strokes.at(-1)?.end ?? 0,
    text: normalized,
    unsupported,
    settings,
    scale,
  };
}

/** Preview and exported SVG use the same self-contained SMIL markup. */
export function renderScene(scene: Scene): SVGSVGElement {
  const document = new DOMParser().parseFromString(exportSvg(scene, 'animated'), 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror')) throw new Error('Could not create SVG');
  return window.document.importNode(root, true) as unknown as SVGSVGElement;
}

/** Thin transport around the SVG timeline; the UI can poll its getters. */
export class Player {
  private playing = false;
  private frame = 0;
  private readonly timeline: ReturnType<typeof getTimeline>;

  constructor(private readonly svg: SVGSVGElement, private readonly scene: Scene) {
    this.timeline = getTimeline(scene);
    this.svg.pauseAnimations();
    this.svg.setCurrentTime(0);
  }

  get currentTime(): number {
    const time = this.svg.getCurrentTime();
    const { cycle, duration } = this.timeline;
    const position = cycle > 0 && this.scene.settings.loop ? time % cycle : time;
    // Browser SVG clocks use single-precision values. Treat their final tiny
    // rounding difference as completion so play can reliably start again.
    return position >= duration - 0.0001 ? duration : position;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (this.timeline.duration === 0 || this.playing) return;
    if (!this.scene.settings.loop && this.currentTime >= this.timeline.duration) this.svg.setCurrentTime(0);
    this.playing = true;
    this.svg.unpauseAnimations();
    this.watchEnd();
  }

  pause(): void {
    this.playing = false;
    this.svg.pauseAnimations();
    cancelAnimationFrame(this.frame);
  }

  restart(): void {
    this.pause();
    this.svg.setCurrentTime(0);
    this.play();
  }

  seek(seconds: number): void {
    this.svg.setCurrentTime(finiteClamp(seconds, 0, this.timeline.duration, 0));
    if (!this.scene.settings.loop && this.currentTime >= this.timeline.duration) this.pause();
  }

  destroy(): void {
    this.pause();
  }

  private watchEnd = (): void => {
    if (!this.playing) return;
    if (!this.scene.settings.loop && this.svg.getCurrentTime() >= this.timeline.duration) {
      this.svg.setCurrentTime(this.timeline.duration);
      this.pause();
      return;
    }
    this.frame = requestAnimationFrame(this.watchEnd);
  };
}
