export interface CropPoint { readonly x: number; readonly y: number }
export interface ImageSize { readonly width: number; readonly height: number }

export function fullImagePoints({ width, height }: ImageSize): readonly CropPoint[] {
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
}

function cross(a: CropPoint, b: CropPoint, c: CropPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(a: CropPoint, b: CropPoint, c: CropPoint, d: CropPoint): boolean {
  const side = (p: CropPoint, q: CropPoint, r: CropPoint) => Math.sign(cross(p, q, r));
  const on = (p: CropPoint, q: CropPoint, r: CropPoint) => cross(p, q, r) === 0
    && r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x)
    && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  return (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0)
    || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

export function parseCropPoints(raw: unknown, size?: ImageSize): readonly CropPoint[] {
  const message = 'Choose 3–12 distinct crop points inside the image without crossing the edges.';
  let value: unknown;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error(message); }
  if (!Array.isArray(value) || value.length < 3 || value.length > 12) throw new Error(message);
  const points: CropPoint[] = value.map((p: unknown) => {
    if (typeof p !== 'object' || p === null || !('x' in p) || !('y' in p)
      || typeof p.x !== 'number' || typeof p.y !== 'number'
      || !Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)
      || p.x < 0 || p.y < 0 || (size && (p.x > size.width || p.y > size.height))) throw new Error(message);
    return { x: p.x, y: p.y };
  });
  if (new Set(points.map(p => `${p.x},${p.y}`)).size !== points.length) throw new Error(message);
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
    if (intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) throw new Error(message);
  }
  const area = Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
  if (area < 1) throw new Error(message);
  return points;
}

/** Add along the longest usable edge; remove the least area-changing vertex. */
export function resizeCropPoints(points: readonly CropPoint[], count: number, size: ImageSize): readonly CropPoint[] {
  if (!Number.isInteger(count) || count < 3 || count > 12) throw new Error('Choose between 3 and 12 points.');
  let next = parseCropPoints(points, size);
  while (next.length !== count) {
    const adding = next.length < count;
    const candidates = next.map((p, i) => {
      const q = next[(i + 1) % next.length];
      const middle = { x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) };
      return {
        score: adding ? -Math.hypot(p.x - q.x, p.y - q.y) : Math.abs(cross(next[(i + next.length - 1) % next.length], p, q)),
        points: adding ? [...next.slice(0, i + 1), middle, ...next.slice(i + 1)] : next.filter((_, index) => index !== i),
      };
    }).sort((a, b) => a.score - b.score);
    const valid = candidates.find(candidate => { try { parseCropPoints(candidate.points, size); return true; } catch { return false; } });
    if (!valid) throw new Error('This selection is too small for that many points. Choose fewer points.');
    next = valid.points;
  }
  return next;
}

export function selectionBounds(points: readonly CropPoint[]) {
  const x = Math.min(...points.map(p => p.x));
  const y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}

export function moveCropPoint(points: readonly CropPoint[], index: number, point: CropPoint, size: ImageSize): readonly CropPoint[] {
  const next = points.map((p, i) => i === index ? {
    x: Math.max(0, Math.min(size.width, Math.round(point.x))),
    y: Math.max(0, Math.min(size.height, Math.round(point.y))),
  } : p);
  try { return parseCropPoints(next, size); } catch { return points; }
}

export function translateCrop(points: readonly CropPoint[], dx: number, dy: number, size: ImageSize): readonly CropPoint[] {
  const box = selectionBounds(points);
  const x = Math.max(-box.x, Math.min(size.width - box.x - box.width, Math.round(dx)));
  const y = Math.max(-box.y, Math.min(size.height - box.y - box.height, Math.round(dy)));
  return points.map(p => ({ x: p.x + x, y: p.y + y }));
}
