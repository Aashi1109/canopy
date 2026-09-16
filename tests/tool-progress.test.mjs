import assert from "node:assert/strict";
import test from "node:test";

import { createThrottledProgressReporter } from "../lib/tool-framework/progress.ts";

test("progress emits at most once per 100 milliseconds", () => {
  let time = 0;
  const values = [];
  const report = createThrottledProgressReporter((value) => values.push(value), {
    now: () => time,
  });

  report("start");
  time = 99;
  report("suppressed");
  time = 100;
  report("next");
  time = 250;
  report("final");

  assert.deepEqual(values, ["start", "next", "final"]);
});
