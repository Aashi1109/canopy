import { expect, test } from "vitest";
import { parseSettings } from "../../lib/tool-framework/settings.ts";
import definition from "./definition.ts";
import { run } from "./run.ts";

async function execute(text, settings = {}, signal = new AbortController().signal) {
  return run({ input: { text, files: [] }, settings: parseSettings(definition.settings, settings), signal });
}

test("html-viewer: empty and whitespace-only sources produce actionable input errors", async () => {
  for (const input of ["", " \t\n"]) {
    await expect(execute(input)).rejects.toMatchObject({
      code: "input-required",
      message: expect.stringMatching(/input|source/i),
    });
  }
});

test("html-viewer: default export is exact, outlines preserve doctype and original markup", async () => {
  const source = "<!DOCTYPE html><p>é &amp; 😀</p><script>parent.bad = true</script>";
  expect(await execute(source)).toEqual({ render: "html", html: source, downloadName: "preview.html" });
  const outlined = await execute(source, { showOutlines: true });
  expect(outlined.html).toMatch(/^<!DOCTYPE html><style>.*outline:1px solid/);
  expect(outlined.html.endsWith(source.slice("<!DOCTYPE html>".length))).toBe(true);
});
