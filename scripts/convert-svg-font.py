# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools==4.60.1"]
# ///
"""Convert an open-path SVG font to InkMotion stroke JSON (development only)."""

import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

NS = {'svg': 'http://www.w3.org/2000/svg'}


def number(value):
    return format(value, '.4f').rstrip('0').rstrip('.') or '0'


def convert(source):
    root = ET.parse(source).getroot()
    font = root.find('.//svg:font', NS)
    if font is None:
        raise ValueError('No SVG font found')
    face = font.find('svg:font-face', NS)
    units = float(face.attrib['units-per-em'])
    default_width = float(font.attrib['horiz-adv-x'])
    space = default_width
    characters = {}
    for glyph in font.findall('svg:glyph', NS):
        character = glyph.get('unicode', '')
        width = float(glyph.get('horiz-adv-x', default_width))
        if character == ' ':
            space = width
        data = glyph.get('d', '').strip()
        # The engine lays out Unicode characters, rather than font ligatures.
        if len(character) != 1 or not data:
            continue
        pen = SVGPathPen(None, ntos=number)
        # SVG fonts use Y-up coordinates; ordinary SVG paths use Y-down.
        parse_path(data, TransformPen(pen, (1, 0, 0, -1, 0, 0)))
        # SVGPathPen emits absolute moves. Each move starts a separate stroke,
        # retaining pen lifts and avoiding invisible travel in reveal timing.
        paths = [{'d': part, 'mx': 0, 'my': 0}
                 for part in re.split(r'(?=M)', pen.getCommands()) if part]
        characters[str(ord(character))] = {'paths': paths, 'w': width}
    missing = [chr(code) for code in range(33, 127) if str(code) not in characters]
    if missing:
        raise ValueError(f'Incomplete printable ASCII: {missing}')
    return {
        'c': dict(sorted(characters.items(), key=lambda item: int(item[0]))),
        'p': {'tf': units, 'lh': units, 'space': space, 'bsw': 0.5},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    data = convert(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{args.output}: {len(data["c"])} glyphs')
