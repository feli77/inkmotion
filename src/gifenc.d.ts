declare module 'gifenc' {
  type ColorFormat = 'rgb565' | 'rgb444' | 'rgba4444';
  export function quantize(data: Uint8ClampedArray, maxColors: number, options?: { format?: ColorFormat }): number[][];
  export function applyPalette(data: Uint8ClampedArray, palette: number[][], format?: ColorFormat): Uint8Array<ArrayBuffer>;
  export function GIFEncoder(): {
    writeFrame(pixels: Uint8Array, width: number, height: number, options?: {
      palette?: number[][];
      delay?: number;
      repeat?: number;
      transparent?: boolean;
      transparentIndex?: number;
      dispose?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  };
}
