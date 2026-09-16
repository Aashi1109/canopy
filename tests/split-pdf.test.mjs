import assert from "node:assert/strict";
import test from "node:test";
import { splitPageGroups } from "../tools/split-pdf/groups.ts";

test("split PDF plans the exact parts and rejects invalid settings before creating outputs", () => {
  const settings = { mode: "every-page", interval: 3, ranges: "1,3;2-4" };
  assert.deepEqual(splitPageGroups(settings, 4), [[1], [2], [3], [4]]);
  assert.deepEqual(splitPageGroups({ ...settings, mode: "interval" }, 4), [[1, 2, 3], [4]]);
  assert.deepEqual(splitPageGroups({ ...settings, mode: "interval", interval: 10 }, 4), [[1, 2, 3, 4]]);
  assert.deepEqual(splitPageGroups({ ...settings, mode: "ranges" }, 4), [
    [1, 3],
    [2, 3, 4],
  ]);
  assert.deepEqual(splitPageGroups({ ...settings, mode: "ranges", ranges: "all;4" }, 4), [[1, 2, 3, 4], [4]]);
  assert.deepEqual(splitPageGroups(settings, 1), [[1]]);
  for (const interval of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => splitPageGroups({ ...settings, mode: "interval", interval }, 4), {
      code: "invalid-interval",
    });
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
    assert.throws(() => splitPageGroups({ ...settings, mode: "ranges", ranges }, 4), { code });
  }
});
