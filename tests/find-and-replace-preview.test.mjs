import assert from "node:assert/strict";
import test from "node:test";

import { buildReplacementPreview } from "../tools/find-and-replace/preview.ts";

function replacements(preview) {
  return preview.parts.filter((part) => part.kind === "replacement");
}

test("find and replace preview identifies every literal match", () => {
  const preview = buildReplacementPreview("Deploy staging, then verify staging.", {
    ci: false,
    find: "staging",
    regex: false,
    replace: "production",
  });

  assert.equal(preview.count, 2);
  assert.equal(preview.invalidPattern, false);
  assert.deepEqual(replacements(preview), [
    { found: "staging", kind: "replacement", replacement: "production" },
    { found: "staging", kind: "replacement", replacement: "production" },
  ]);
});

test("find and replace preview respects case-insensitive literal matching", () => {
  const preview = buildReplacementPreview("Stage STAGE stage", {
    ci: true,
    find: "stage",
    regex: false,
    replace: "production",
  });

  assert.deepEqual(
    replacements(preview).map((part) => part.found),
    ["Stage", "STAGE", "stage"],
  );
});

test("find and replace preview expands regular-expression capture groups", () => {
  const preview = buildReplacementPreview("Ada Lovelace and Grace Hopper", {
    ci: false,
    find: "(Ada|Grace) (\\w+)",
    regex: true,
    replace: "$2, $1",
  });

  assert.deepEqual(
    replacements(preview).map((part) => part.replacement),
    ["Lovelace, Ada", "Hopper, Grace"],
  );
});

test("find and replace preview reports an invalid regular expression", () => {
  const preview = buildReplacementPreview("text", {
    ci: false,
    find: "[",
    regex: true,
    replace: "value",
  });

  assert.equal(preview.invalidPattern, true);
  assert.equal(preview.count, 0);
  assert.deepEqual(preview.parts, [{ kind: "text", text: "text" }]);
});

test("find and replace preview preserves the exact count when inline rendering is capped", () => {
  const preview = buildReplacementPreview("a".repeat(205), {
    ci: false,
    find: "a",
    regex: false,
    replace: "b",
  });

  assert.equal(preview.count, 205);
  assert.equal(preview.previewedCount, 200);
  assert.equal(preview.truncated, true);
  assert.equal(replacements(preview).length, 200);
  assert.deepEqual(preview.parts.at(-1), {
    hiddenMatchCount: 5,
    kind: "unpreviewed",
    text: "aaaaa",
  });
});

test("find and replace preview follows native two-digit capture fallback", () => {
  const preview = buildReplacementPreview("a", {
    ci: false,
    find: "(a)",
    regex: true,
    replace: "$12",
  });

  assert.equal(replacements(preview)[0].replacement, "a2");
});

test("find and replace preview expands native replacement tokens", () => {
  const preview = buildReplacementPreview("before Ada after", {
    ci: false,
    find: "(?<name>Ada)",
    regex: true,
    replace: "$$|$&|$<name>|$<missing>|$`|$'|$2",
  });

  assert.equal(replacements(preview)[0].replacement, "$|Ada|Ada||before | after|$2");
});
