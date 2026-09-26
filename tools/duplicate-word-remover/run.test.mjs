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

test("duplicate-word-remover: case-insensitive duplicates preserve first spelling and punctuation distinctions", async () => {
  expect(await execute("  Café\tCAFÉ café!  你好 你好\nworld WORLD  ")).toEqual({
    render: "text",
    text: "Café café! 你好 world",
  });
});

test("duplicate-word-remover: empty text remains empty", async () => {
  expect((await execute()).text).toBe("");
});
