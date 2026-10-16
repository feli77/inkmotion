# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools==4.60.1"]
# ///
"""Convert Make Me a Hanzi graphics.txt to local, per-character stroke JSON."""

import argparse
import json
import math
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

SOURCE_COMMIT = 'bddc96d41bef78427ed0e034e9f7e31d71fd1b92'
NOTICE = ('InkMotion conversion, 2026-10-16: inverted Y, added extended centerlines '
          'and reveal widths, split into codepoint files. Arphic Public License; '
          'see ../LICENSE-Chinese-Kaiti.txt. Source: skishore/makemeahanzi@' + SOURCE_COMMIT)


def number(value):
    return format(value, '.4f').rstrip('0').rstrip('.') or '0'


class SamplesPen(BasePen):
    """Sample contours to size a conservative centerline reveal brush."""

    def __init__(self):
        super().__init__(None)
        self.samples = []

    def _moveTo(self, point):
        self.samples.append(point)

    def _lineTo(self, point):
        start = self._getCurrentPoint()
        count = max(1, math.ceil(math.dist(start, point) / 8))
        self.samples.extend(tuple(a + (b - a) * step / count for a, b in zip(start, point))
                            for step in range(1, count + 1))

    def _curveToOne(self, first, second, end):
        start = self._getCurrentPoint()
        for step in range(1, 65):
            t = step / 64
            self.samples.append(tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b
                                      + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                                      for a, b, c, d in zip(start, first, second, end)))

    def _qCurveToOne(self, control, end):
        start = self._getCurrentPoint()
        for step in range(1, 65):
            t = step / 64
            self.samples.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c
                                      for a, b, c in zip(start, control, end)))

    def _closePath(self):
        pass


def distance(point, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = dx * dx + dy * dy
    t = max(0, min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length)) if length else 0
    return math.hypot(point[0] - start[0] - dx * t, point[1] - start[1] - dy * t)


def stroke(outline, median):
    if len(median) < 2:
        raise ValueError('A stroke must have at least two median points')
    pen = SVGPathPen(None, ntos=number)
    parse_path(outline, TransformPen(pen, (1, 0, 0, -1, 0, 0)))
    samples = SamplesPen()
    parse_path(outline, samples)
    segments = list(zip(median, median[1:]))
    radius = max(110, max(min(distance(point, start, end) for start, end in segments)
                          for point in samples.samples) + 16)
    points = [[x, -y] for x, y in median]
    # Extend both ends so the round reveal brush reaches the original terminals.
    for index, neighbour in [(0, 1), (-1, -2)]:
        dx, dy = points[index][0] - points[neighbour][0], points[index][1] - points[neighbour][1]
        length = math.hypot(dx, dy)
        if length:
            extension = [points[index][0] + radius * dx / length, points[index][1] + radius * dy / length]
            if index == 0:
                points.insert(0, extension)
            else:
                points.append(extension)
    return {'d': 'M' + 'L'.join(f'{number(x)} {number(y)}' for x, y in points),
            'mx': 0, 'my': 0, 'outline': {'d': pen.getCommands(), 'width': round(radius * 2, 4)}}


def punctuation():
    # Original single-line punctuation, in a 1024-unit em with baseline at zero.
    paths = {
        '，': ['M350 -100Q400 -55 330 40'], '、': ['M300 -130L405 -35'],
        '。': ['M340 -100a45 45 0 1 0 90 0a45 45 0 1 0 -90 0'],
        '！': ['M512 -730L512 -250', 'M512 -110L512 -90'],
        '？': ['M330 -620C330 -850 760 -820 700 -580Q690 -510 540 -440Q512 -420 512 -280', 'M512 -110L512 -90'],
        '：': ['M512 -500L512 -480', 'M512 -120L512 -100'],
        '；': ['M512 -500L512 -480', 'M512 -120Q560 -50 480 40'],
        '（': ['M650 -850Q280 -400 650 80'], '）': ['M374 -850Q744 -400 374 80'],
        '「': ['M750 -800H500V-300'], '」': ['M274 0H524V-500'],
        '『': ['M800 -850H450V-300', 'M800 -740H560V-300'],
        '』': ['M224 50H574V-500', 'M224 -60H464V-500'],
        '《': ['M650 -800L350 -400L650 0', 'M900 -800L600 -400L900 0'],
        '》': ['M124 -800L424 -400L124 0', 'M374 -800L674 -400L374 0'],
        '〈': ['M650 -800L350 -400L650 0'], '〉': ['M374 -800L674 -400L374 0'],
        '【': ['M700 -800H400V0H700'], '】': ['M324 -800H624V0H324'],
        '〔': ['M700 -800L400 -650V-150L700 0'], '〕': ['M324 -800L624 -650V-150L324 0'],
        '“': ['M420 -800Q320 -720 390 -670', 'M620 -800Q520 -720 590 -670'],
        '”': ['M390 -800Q480 -730 380 -660', 'M590 -800Q680 -730 580 -660'],
        '‘': ['M520 -800Q420 -720 490 -670'], '’': ['M490 -800Q580 -730 480 -660'],
        '…': ['M260 -100L262 -100', 'M510 -100L512 -100', 'M760 -100L762 -100'],
        '—': ['M80 -400H944'], '·': ['M510 -400L512 -400'],
    }
    return {str(ord(char)): {'w': 1024, 'paths': [{'d': d, 'mx': 0, 'my': 0} for d in strokes]}
            for char, strokes in paths.items()}


def convert(source, output, fallback):
    directory = output.with_suffix('')
    directory.mkdir(parents=True, exist_ok=True)
    characters = []
    for line in source.read_text().splitlines():
        value = json.loads(line)
        character = value['character']
        if len(value['strokes']) != len(value['medians']):
            raise ValueError(f'Mismatched strokes for {character}')
        glyph = {'notice': NOTICE, 'w': 1024,
                 'paths': [stroke(outline, median) for outline, median in zip(value['strokes'], value['medians'])]}
        (directory / f'{ord(character)}.json').write_text(json.dumps(glyph, ensure_ascii=False, separators=(',', ':')) + '\n')
        characters.append(character)
    latin = json.loads(fallback.read_text())
    factor = 1024 / latin['p']['tf']
    glyphs = {}
    for code, glyph in latin['c'].items():
        paths = []
        for path in glyph['paths']:
            pen = SVGPathPen(None, ntos=number)
            parse_path(path['d'], TransformPen(pen, (factor, 0, 0, factor, path['mx'] * factor, -path['my'] * factor)))
            paths.append({'d': pen.getCommands(), 'mx': 0, 'my': 0})
        glyphs[code] = {'paths': paths, 'w': round(glyph['w'] * factor, 4)}
    glyphs.update(punctuation())
    # Fullwidth Latin forms share the fallback paths, centered in a full em.
    for code in range(0xff01, 0xff5f):
        original = glyphs[str(code - 0xfee0)]
        glyphs[str(code)] = {'w': 1024, 'paths': [{**path, 'mx': (1024 - original['w']) / 2} for path in original['paths']]}
    data = {'c': glyphs, 'glyphs': {'directory': f'/fonts/{directory.name}', 'characters': ''.join(sorted(characters))},
            'p': {'tf': 1024, 'lh': 1024, 'space': latin['p']['space'] * factor, 'bsw': 0.5,
                  'preserveBearings': True, 'ascent': 900, 'descent': 124}}
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{output}: {len(characters)} per-character files; {len(glyphs)} local fallback and punctuation glyphs')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--fallback', type=Path, default=Path('public/fonts/relief-singleline.json'))
    args = parser.parse_args()
    convert(args.source, args.output, args.fallback)
