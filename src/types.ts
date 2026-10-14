/** Original Vara stroke-font format. Paths retain their source coordinates. */
export interface FontPath {
  d: string;
  mx: number;
  my: number;
}

export interface FontGlyph {
  paths: FontPath[];
  w: number;
}

export interface FontData {
  c: Record<string, FontGlyph>;
  p: {
    tf: number;
    lh: number;
    space: number;
    bsw: number;
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
