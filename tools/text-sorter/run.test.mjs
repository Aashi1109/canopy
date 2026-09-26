import { expect, test } from "vitest";
import { parseSettings } from "../../lib/tool-framework/settings.ts";
import definition from "./definition.ts";
import { run } from "./run.ts";

async function execute(text = "", settings = {}, secondary) {
  return run({
    input: { text, secondary, files: [] },
    settings: parseSettings(definition.settings, settings),
    signal: new AbortController().signal,
  });
}

test.each([
  ["asc", true, "Alpha\nalpha\nbeta\nzebra"],
  ["desc", true, "zebra\nbeta\nAlpha\nalpha"],
  ["asc", false, "alpha\nAlpha\nbeta\nzebra"],
  ["desc", false, "zebra\nbeta\nAlpha\nalpha"],
])("text-sorter: %s ci=%s preserves duplicate rows and returns a downloadable result", async (order, ci, output) => {
  expect(await execute("beta\r\nAlpha\ralpha\nzebra", { order, ci })).toEqual({
    render: "text",
    text: output,
    downloadName: "sorted-text.txt",
  });
});

test("text-sorter: empty text remains empty", async () => {
  expect((await execute()).text).toBe("");
});
