import { expect, test } from "vitest";
import { splitPageGroups } from "../tools/split-pdf/groups.ts";

test("split PDF plans the exact parts and rejects invalid settings before creating outputs", () => {
  const settings = { mode: "every-page", interval: 3, ranges: "1,3;2-4" };
  expect(splitPageGroups(settings, 4)).toEqual([[1], [2], [3], [4]]);
  expect(splitPageGroups({ ...settings, mode: "interval" }, 4)).toEqual([[1, 2, 3], [4]]);
  expect(splitPageGroups({ ...settings, mode: "interval", interval: 10 }, 4)).toEqual([[1, 2, 3, 4]]);
  expect(splitPageGroups({ ...settings, mode: "ranges" }, 4)).toEqual([
    [1, 3],
    [2, 3, 4],
  ]);
  expect(splitPageGroups({ ...settings, mode: "ranges", ranges: "all;4" }, 4)).toEqual([[1, 2, 3, 4], [4]]);
  expect(splitPageGroups(settings, 1)).toEqual([[1]]);
  for (const interval of [0, -1, 1.5, NaN, Infinity]) {
    expect(() => splitPageGroups({ ...settings, mode: "interval", interval }, 4)).toThrow(
      expect.objectContaining({
        code: "invalid-interval",
      }),
    );
  }
  for (const [ranges, code] of [
    ["", "empty-range"],
    ["1;", "empty-range"],
    ["1,1", "duplicate-page"],
    ["4-2", "reversed-range"],
    ["1;5", "page-out-of-range"],
    ["0", "page-out-of-range"],
    ["1,,2", "invalid-range"],
  ]) {
    expect(() => splitPageGroups({ ...settings, mode: "ranges", ranges }, 4)).toThrow(
      expect.objectContaining({ code }),
    );
  }
});
