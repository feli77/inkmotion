"""Convert Tegaki's sampled widths to InkMotion JSON (development only)."""

import argparse
import json
import statistics
from pathlib import Path


def number(value):
    return format(value, '.4f').rstrip('0').rstrip('.') or '0'


def convert(source, units, space):
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
    return {
        'c': dict(sorted(characters.items(), key=lambda item: int(item[0]))),
        # A reference width makes the existing px control scale all native widths equally.
        'p': {'tf': units, 'lh': units, 'space': space, 'bsw': statistics.median(widths)},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--units', type=float, default=1000)
    parser.add_argument('--space', type=float, default=242, help='Space advance; Caveat uses 242/1000 em')
    args = parser.parse_args()
    data = convert(json.loads(args.source.read_text()), args.units, args.space)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{args.output}: {len(data["c"])} glyphs with sampled widths')
