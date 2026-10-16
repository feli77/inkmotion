import type { BrushGeometry, BrushNib, BrushPoint, BrushSegment, BrushStamp } from './types';

/** Build local pieces so a crossing never reveals a future arm of the stroke. */
export function createBrush(points: BrushPoint[], nibs: BrushNib[], widthScale: number): BrushGeometry {
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
  }
  const length = cumulative.at(-1) ?? 0;
  const scaled: BrushPoint[] = points.map(([x, y, width]) => [x, y, Math.max(0.01, width * widthScale)]);
  const segments: BrushSegment[] = [];
  for (let index = 1; index < points.length; index++) {
    if (cumulative[index] === cumulative[index - 1]) continue;
    segments.push({ from: scaled[index - 1], to: scaled[index], start: cumulative[index - 1] / length, end: cumulative[index] / length });
  }
  if (!segments.length) segments.push({ from: scaled[0], to: scaled[0], start: 0, end: 1 });
  const stamps: BrushStamp[] = nibs.map(([index, dx, dy, major, minor, angle]) => ({
    x: points[index][0] + dx,
    y: points[index][1] + dy,
    rx: major * widthScale / 2,
    ry: minor * widthScale / 2,
    angle,
    at: length > 0 ? cumulative[index] / length : 0,
  }));
  const boxes = scaled.map(([x, y, width]) => ({ left: x - width / 2, right: x + width / 2, top: y - width / 2, bottom: y + width / 2 }));
  for (const stamp of stamps) {
    const cosine = Math.cos(stamp.angle);
    const sine = Math.sin(stamp.angle);
    const dx = Math.hypot(stamp.rx * cosine, stamp.ry * sine);
    const dy = Math.hypot(stamp.rx * sine, stamp.ry * cosine);
    boxes.push({ left: stamp.x - dx, right: stamp.x + dx, top: stamp.y - dy, bottom: stamp.y + dy });
  }
  return {
    segments,
    stamps,
    length: length || scaled[0][2],
    bounds: {
      left: Math.min(...boxes.map(box => box.left)), right: Math.max(...boxes.map(box => box.right)),
      top: Math.min(...boxes.map(box => box.top)), bottom: Math.max(...boxes.map(box => box.bottom)),
    },
  };
}

const number = (value: number): string => value.toFixed(4).replace(/\.?0+$/, '') || '0';

/** Identical command topology lets SMIL interpolate the moving tip and width. */
export function brushSegmentPath(segment: BrushSegment, progress = 1): string {
  const [x, y, width] = segment.from;
  const dx = segment.to[0] - x;
  const dy = segment.to[1] - y;
  const length = Math.hypot(dx, dy);
  const radius = width / 2;
  const tipRadius = (width + (segment.to[2] - width) * progress) / 2;
  const tipX = x + dx * progress;
  const tipY = y + dy * progress;
  const point = (px: number, py: number): string => `${number(px)} ${number(py)}`;
  const difference = radius - segment.to[2] / 2;
  if (length === 0 || Math.abs(difference) >= length) {
    // One disk contains every earlier disk when width changes this steeply.
    const [cx, cy, r] = difference > 0 ? [x, y, radius] : [tipX, tipY, tipRadius];
    const arc = `${point(r, r)} 0 1 0`;
    return `M${point(cx, cy + r)}A${arc} ${point(cx, cy - r)}A${arc} ${point(cx, cy + r)}Z`;
  }
  // Tangents to the two endpoint disks form their swept envelope. The normals
  // stay constant during interpolation, so a moving round tip never erases ink.
  const along = difference / length;
  const across = Math.sqrt(1 - along * along);
  const ax = dx / length * along - dy / length * across;
  const ay = dy / length * along + dx / length * across;
  const bx = dx / length * along + dy / length * across;
  const by = dy / length * along - dx / length * across;
  return `M${point(x + ax * radius, y + ay * radius)}L${point(tipX + ax * tipRadius, tipY + ay * tipRadius)}`
    + `A${point(tipRadius, tipRadius)} 0 ${along < 0 ? 1 : 0} 0 ${point(tipX + bx * tipRadius, tipY + by * tipRadius)}`
    + `L${point(x + bx * radius, y + by * radius)}A${point(radius, radius)} 0 ${along > 0 ? 1 : 0} 0 ${point(x + ax * radius, y + ay * radius)}Z`;
}

export function brushStampPath(stamp: BrushStamp): string {
  const dx = stamp.rx * Math.cos(stamp.angle);
  const dy = stamp.rx * Math.sin(stamp.angle);
  const arc = `${number(stamp.rx)} ${number(stamp.ry)} ${number(stamp.angle * 180 / Math.PI)} 1 0`;
  return `M${number(stamp.x + dx)} ${number(stamp.y + dy)}A${arc} ${number(stamp.x - dx)} ${number(stamp.y - dy)}`
    + `A${arc} ${number(stamp.x + dx)} ${number(stamp.y + dy)}Z`;
}
