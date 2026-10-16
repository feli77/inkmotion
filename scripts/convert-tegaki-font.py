"""Convert Tegaki's sampled widths to InkMotion JSON (development only)."""

import argparse
import json
import statistics
from pathlib import Path


def number(value):
    return format(value, '.4f').rstrip('0').rstrip('.') or '0'


def convert(source, units, space, preserve_bearings=False):
    characters = {}
    widths = []
    for character, glyph in source.items():
        if len(character) != 1:
            continue
        paths = []
        for stroke in glyph['s']:
            points = stroke['p']
            if not points:
                continue
            for x, y, width in points:
                if width > 0:
                    widths.append(width)
            data = 'M' + 'L'.join(f'{number(x)} {number(y)}' for x, y, _ in points)
            path = {'d': data, 'mx': 0, 'my': 0, 'points': points}
            if stroke.get('n'):
                path['nibs'] = stroke['n']
            paths.append(path)
        if paths:
            characters[str(ord(character))] = {'paths': paths, 'w': glyph['w']}
    metrics = {'tf': units, 'lh': units, 'space': space, 'bsw': statistics.median(widths)}
    if preserve_bearings:
        metrics['preserveBearings'] = True
    return {
        'c': dict(sorted(characters.items(), key=lambda item: int(item[0]))),
        # A reference width makes the existing px control scale all native widths equally.
        'p': metrics,
    }


def write_font(data, output, split_glyphs=False):
    output.parent.mkdir(parents=True, exist_ok=True)
    if split_glyphs:
        directory = output.with_suffix('')
        directory.mkdir(parents=True, exist_ok=True)
        codes = [code for code in data['c'] if 0x3400 <= int(code) <= 0x9fff]
        for code in codes:
            glyph = data['c'].pop(code)
            (directory / f'{code}.json').write_text(json.dumps(glyph, ensure_ascii=False, separators=(',', ':')) + '\n')
        data['glyphs'] = {'directory': f'/fonts/{directory.name}', 'characters': ''.join(chr(int(code)) for code in codes)}
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--units', type=float, required=True, help='Source font units per em')
    parser.add_argument('--space', type=float, required=True, help='Source font space advance in font units')
    parser.add_argument('--preserve-bearings', action='store_true', help='Keep source advances and bearings for connected scripts')
    parser.add_argument('--split-glyphs', action='store_true', help='Store Chinese glyphs in per-codepoint files with a coverage manifest')
    parser.add_argument('--ascent', type=float, help='Fixed source font ascender for on-demand measurement')
    parser.add_argument('--descent', type=float, help='Positive source font descender for on-demand measurement')
    args = parser.parse_args()
    data = convert(json.loads(args.source.read_text()), args.units, args.space, args.preserve_bearings)
    count = len(data['c'])
    if args.ascent is not None:
        data['p']['ascent'] = args.ascent
    if args.descent is not None:
        data['p']['descent'] = args.descent
    write_font(data, args.output, args.split_glyphs)
    print(f'{args.output}: {count} glyphs with sampled widths')
