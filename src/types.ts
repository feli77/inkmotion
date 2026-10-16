/** A point on a variable-width pen trajectory, in source font units. */
export type BrushPoint = [x: number, y: number, width: number];
/** An elliptic terminal attached to a trajectory point; angle is in radians. */
export type BrushNib = [pointIndex: number, dx: number, dy: number, major: number, minor: number, angle: number];

/** A filled stroke revealed along its centerline, in source font units. */
export interface StrokeOutline {
  d: string;
  width: number;
}

/** Vara-compatible stroke format with optional sampled pen widths. */
export interface FontPath {
  d: string;
  mx: number;
  my: number;
  points?: BrushPoint[];
  nibs?: BrushNib[];
  outline?: StrokeOutline;
}

export interface FontGlyph {
  paths: FontPath[];
  w: number;
}

export interface FontData {
  c: Record<string, FontGlyph>;
  /** Local, per-codepoint glyph files; the manifest prevents missing requests. */
  glyphs?: { directory: string; characters: string };
  p: {
    tf: number;
    lh: number;
    space: number;
    /** For sampled fonts, the reference width scaled by the canvas px control. */
    bsw: number;
    /** Retain original advances and side bearings for connected script fonts. */
    preserveBearings?: boolean;
    /** Fixed em metrics for fonts whose glyphs are measured on demand. */
    ascent?: number;
    descent?: number;
    slc?: string;
    slj?: string;
    s?: number;
  };
}

export interface RenderSettings {
  fontId: string;
  fontSize: number;
  /** Stroke width in final SVG canvas pixels. */
  strokeWidth: number;
  /** Speed multiplier: 1 is normal; 2 is twice as fast. */
  speed: number;
  color: string;
  /** Baseline distance as a multiple of fontSize. */
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  background: string;
  loop: boolean;
  width: number;
  padding: number;
}

export interface Stroke {
  d: string;
  transform: string;
  /** Original, unscaled SVG path length (also used for dash values). */
  length: number;
  /** Seconds from the beginning of the complete scene. */
  start: number;
  end: number;
  brush?: BrushGeometry;
  outline?: StrokeOutline;
}

export interface BrushSegment {
  from: BrushPoint;
  to: BrushPoint;
  /** Fractions of this stroke's drawing duration. */
  start: number;
  end: number;
}

export interface BrushStamp {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  at: number;
}

export interface BrushGeometry {
  segments: BrushSegment[];
  stamps: BrushStamp[];
  length: number;
  bounds: { left: number; right: number; top: number; bottom: number };
}

export interface Scene {
  width: number;
  height: number;
  strokes: Stroke[];
  /** Writing duration; a loop's final hold is separate. */
  duration: number;
  text: string;
  unsupported: string[];
  settings: RenderSettings;
  /** Conversion factor from source font coordinates to canvas pixels. */
  scale: number;
}
