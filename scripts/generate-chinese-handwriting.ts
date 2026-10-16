/** Development only: run with Bun --conditions=tegaki@dev and a pinned Tegaki checkout. */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tegakiCommit = '32654a4cfb0fa6a2873264cf693316acd59d1627';
const [tegakiRoot, fontFile, outputDirectory, characterFile] = process.argv.slice(2);
if (!tegakiRoot || !fontFile || !outputDirectory) {
  throw new Error('Usage: bun --conditions=tegaki@dev scripts/generate-chinese-handwriting.ts <tegaki-checkout> <font.ttf> <output-directory> [characters.txt]');
}
const revision = execFileSync('git', ['-C', tegakiRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (revision !== tegakiCommit) throw new Error(`Expected Tegaki ${tegakiCommit}, received ${revision}`);
const importGenerator = (path: string) => import(pathToFileURL(resolve(tegakiRoot, 'packages/generator/src', path)).href);
const generator = await importGenerator('commands/generate.ts');
const { DEFAULT_GEOMETRY_OPTIONS } = await importGenerator('geometry/types.ts');
const { createReferenceSet, collectReferences } = await importGenerator('stroke-order/providers.ts');
const fontBuffer = await readFile(fontFile);
const font = await generator.parseFont(fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength));
const characters = [...new Set([...(await readFile(characterFile ?? fileURLToPath(new URL('chinese-handwriting-chars.txt', import.meta.url)), 'utf8')).trim()])];
const referenceDirectory = fileURLToPath(new URL('../public/fonts/chinese-kaiti/', import.meta.url));
const providers = createReferenceSet({
  kanjiVG: { name: 'unused', get: async () => null },
  makeMeAHanzi: {
    name: 'makemeahanzi',
    async get(character: string) {
      try {
        const glyph = JSON.parse(await readFile(resolve(referenceDirectory, `${character.codePointAt(0)}.json`), 'utf8'));
        return {
          char: character, source: 'makemeahanzi', viewBox: { width: 1024, height: 1024 },
          license: 'Make Me a Hanzi / Arphic Public License; see public/fonts/LICENSE-Chinese-Kaiti.txt',
          strokes: glyph.paths.map((path: { d: string }) => {
            const values = path.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
            const points = [];
            for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] + 900 });
            // The InkMotion conversion extended both terminals; references
            // use only the original median samples, in the dataset's frame.
            return { points: points.slice(1, -1) };
          }),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  },
}, 'zh');

const glyphs: Record<string, unknown> = {};
const report: { character: string; strokes: number; order: string; warnings: string[] }[] = [];
const skipped: string[] = [];
const started = performance.now();
await mkdir(outputDirectory, { recursive: true });
for (const [index, character] of characters.entries()) {
  const geometry = generator.processGlyphGeometry(font, character, { ...DEFAULT_GEOMETRY_OPTIONS, hanLocale: 'zh' },
    generator.DEFAULT_OPTIONS.bezierTolerance, await collectReferences(character, providers));
  if (!geometry?.strokesFontUnits.length) {
    skipped.push(character);
    continue;
  }
  const strokes = geometry.strokesFontUnits.map(generator.toCompactStroke);
  for (const stroke of strokes) {
    if (!stroke.p.length || !stroke.p.every((point: number[]) => point.length === 3 && point.every(Number.isFinite) && point[2] >= 0)) {
      throw new Error(`Invalid sampled stroke for ${character}`);
    }
  }
  glyphs[character] = { w: geometry.advanceWidth, s: strokes };
  report.push({ character, strokes: strokes.length, order: geometry.strokeOrderSource, warnings: geometry.warnings });
  if ((index + 1) % 100 === 0) console.log(`${index + 1}/${characters.length} glyphs (${((performance.now() - started) / 1000).toFixed(1)}s)`);
}
const metrics = {
  units: font.unitsPerEm, ascent: font.ascender, descent: Math.abs(font.descender),
  space: font.font.charToGlyph(' ').advanceWidth, family: font.family,
};
await writeFile(resolve(outputDirectory, 'glyphData.json'), JSON.stringify(glyphs));
await writeFile(resolve(outputDirectory, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
await writeFile(resolve(outputDirectory, 'report.json'), JSON.stringify({ tegakiCommit, skipped, glyphs: report }, null, 2) + '\n');
console.log(JSON.stringify({ ...metrics, generated: report.length, skipped, seconds: (performance.now() - started) / 1000 }));
