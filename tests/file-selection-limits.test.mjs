import assert from "node:assert/strict";
import test from "node:test";

import { textInputFileIssue, validateFileSelection } from "../lib/tool-framework/fileSelection.ts";
import { PLATFORM_MAX_BYTES } from "../lib/tool-framework/limits.ts";

const filesSpec = {
  kind: "files",
  label: "Images",
  accept: "image/png",
  multiple: true,
  engine: "image",
  maxBytes: 75,
  maxFiles: 3,
  maxTotalBytes: 100,
};

test("file selection accepts the exact aggregate boundary", () => {
  const first = new File([new Uint8Array(60)], "first.png", { type: "image/png" });
  const second = new File([new Uint8Array(40)], "second.png", { type: "image/png" });
  const result = validateFileSelection([], [first, second], filesSpec);

  assert.deepEqual(result.files, [first, second]);
  assert.equal(result.issue, "");
});

test("file selection rejects only additions beyond the aggregate boundary", () => {
  const current = new File([new Uint8Array(60)], "current.png", { type: "image/png" });
  const overflow = new File([new Uint8Array(41)], "overflow.png", { type: "image/png" });
  const result = validateFileSelection([current], [overflow], filesSpec);

  assert.deepEqual(result.files, [current]);
  assert.match(result.issue, /must total 100 bytes or less/);
});

test("the browser selection boundary clamps oversized declarations to 100 MiB", () => {
  const oversized = {
    name: "oversized.json",
    size: PLATFORM_MAX_BYTES + 1,
    type: "application/json",
  };
  assert.match(
    textInputFileIssue(oversized, {
      accept: ".json,application/json",
      maxBytes: PLATFORM_MAX_BYTES * 2,
    }) ?? "",
    new RegExp(PLATFORM_MAX_BYTES.toLocaleString()),
  );
});
