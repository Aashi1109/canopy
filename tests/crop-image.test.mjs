import { test, expect } from "vitest";
import {
  parseCropPoints,
  selectionBounds,
  moveCropPoint,
  translateCrop,
  fullImagePoints,
  resizeCropPoints,
} from "../tools/crop-image/geometry.ts";
import { validate } from "../tools/crop-image/hooks.ts";

test("pre-run validation accepts freeform geometry and preserves rectangle validation", () => {
  const settings = {
    cropMode: "freeform",
    cropPoints: JSON.stringify(fullImagePoints({ width: 100, height: 80 })),
    cropWidth: 0,
    cropHeight: 0,
  };
  expect(validate(settings, [])).toBe(null);
  expect(validate({ ...settings, cropPoints: "" }, [])).toMatch(/valid crop selection/);
  expect(validate({ ...settings, cropMode: "rectangle" }, [])).toMatch(/valid crop area/);
  expect(validate({ ...settings, cropMode: "rectangle", cropWidth: 10, cropHeight: 20 }, [])).toBe(null);
  expect(validate(settings, [{ name: "source.heic", mime: "image/heic" }])).toMatch(/HEIC/);
});

const size = { width: 100, height: 80 };
const points = [
  { x: 10, y: 10 },
  { x: 90, y: 5 },
  { x: 80, y: 70 },
  { x: 15, y: 60 },
];
test("freeform points round-trip and bound the exact nonrectangular selection", () => {
  expect(parseCropPoints(JSON.stringify(points), size)).toEqual(points);
  expect(selectionBounds(points)).toEqual({ x: 10, y: 5, width: 80, height: 65 });
  expect(selectionBounds(fullImagePoints(size))).toEqual({ x: 0, y: 0, ...size });
});
test("one point moves independently, with source-pixel bounds", () => {
  const next = moveCropPoint(points, 1, { x: 110, y: -5 }, size);
  expect(next[1]).toEqual({ x: 100, y: 0 });
  for (const i of [0, 2, 3]) expect(next[i]).toEqual(points[i]);
  expect(moveCropPoint(points, 1, points[3], size)).toEqual(points);
});
test("translation preserves the shape and clamps the whole selection", () => {
  const next = translateCrop(points, 50, -50, size);
  next.forEach((p, i) => expect(p).toEqual({ x: points[i].x + 10, y: points[i].y - 5 }));
});
test("point count changes preserve added-edge geometry and support 3 through 12 points", () => {
  for (const count of [3, 4, 5, 8, 12]) {
    const next = resizeCropPoints(points, count, size);
    expect(next.length).toBe(count);
    expect(parseCropPoints(JSON.stringify(next), size)).toEqual(next);
    if (count >= 4) for (const p of points) expect(next.some((q) => q.x === p.x && q.y === p.y)).toBeTruthy();
    expect(resizeCropPoints(next, 3, size).length).toBe(3);
  }
  expect(() => resizeCropPoints(points, 2, size)).toThrow();
  expect(() => resizeCropPoints(points, 13, size)).toThrow();
});

test("rejects malformed, crossing, degenerate, fractional and out-of-bounds points", () => {
  for (const raw of [
    "",
    "not json",
    "{}",
    "[]",
    JSON.stringify([...points, points[0]]),
    JSON.stringify([
      { x: 0, y: 0 },
      { x: 100, y: 80 },
      { x: 100, y: 0 },
      { x: 0, y: 80 },
    ]),
    JSON.stringify(points.map(() => ({ x: 10, y: 10 }))),
    JSON.stringify([{ x: -1, y: 0 }, ...points.slice(1)]),
    JSON.stringify([{ x: 1.5, y: 0 }, ...points.slice(1)]),
    JSON.stringify([{ x: "1", y: 0 }, ...points.slice(1)]),
  ]) {
    expect(() => parseCropPoints(raw, size)).toThrow();
  }
});
