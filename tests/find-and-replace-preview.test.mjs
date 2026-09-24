import { test, expect } from "vitest";
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

  expect(preview.count).toBe(2);
  expect(preview.invalidPattern).toBe(false);
  expect(replacements(preview)).toEqual([
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

  expect(replacements(preview).map((part) => part.found)).toEqual(["Stage", "STAGE", "stage"]);
});

test("find and replace preview expands regular-expression capture groups", () => {
  const preview = buildReplacementPreview("Ada Lovelace and Grace Hopper", {
    ci: false,
    find: "(Ada|Grace) (\\w+)",
    regex: true,
    replace: "$2, $1",
  });

  expect(replacements(preview).map((part) => part.replacement)).toEqual(["Lovelace, Ada", "Hopper, Grace"]);
});

test("find and replace preview reports an invalid regular expression", () => {
  const preview = buildReplacementPreview("text", {
    ci: false,
    find: "[",
    regex: true,
    replace: "value",
  });

  expect(preview.invalidPattern).toBe(true);
  expect(preview.count).toBe(0);
  expect(preview.parts).toEqual([{ kind: "text", text: "text" }]);
});

test("find and replace preview preserves the exact count when inline rendering is capped", () => {
  const preview = buildReplacementPreview("a".repeat(205), {
    ci: false,
    find: "a",
    regex: false,
    replace: "b",
  });

  expect(preview.count).toBe(205);
  expect(preview.previewedCount).toBe(200);
  expect(preview.truncated).toBe(true);
  expect(replacements(preview).length).toBe(200);
  expect(preview.parts.at(-1)).toEqual({
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

  expect(replacements(preview)[0].replacement).toBe("a2");
});

test("find and replace preview expands native replacement tokens", () => {
  const preview = buildReplacementPreview("before Ada after", {
    ci: false,
    find: "(?<name>Ada)",
    regex: true,
    replace: "$$|$&|$<name>|$<missing>|$`|$'|$2",
  });

  expect(replacements(preview)[0].replacement).toBe("$|Ada|Ada||before | after|$2");
});
