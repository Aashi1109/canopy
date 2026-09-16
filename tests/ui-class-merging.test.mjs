import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cn } from "../packages/ui/src/lib/utils.ts";

const root = new URL("../", import.meta.url);

test("shared UI class overrides are conflict-aware", async () => {
  const source = await readFile(new URL("packages/ui/src/index.tsx", root), "utf8");

  assert.match(source, /import \{ cn \} from ["']\.\/lib\/utils\.ts["']/);
  assert.doesNotMatch(source, /filter\(Boolean\)\.join\(["'] ["']\)/);
  assert.equal(cn("h-10 p-6 text-sm", "h-9 p-0 text-xs"), "h-9 p-0 text-xs");
});

test("semantic typography sizes survive color changes and conflict with other sizes", () => {
  for (const size of [
    "display",
    "heading-1",
    "heading-2",
    "heading-3",
    "heading-4",
    "heading-5",
    "heading-6",
    "body-large",
    "body",
    "caption",
    "overline",
    "code",
  ]) {
    assert.equal(cn(`text-${size}`, "text-foreground"), `text-${size} text-foreground`);
    assert.equal(cn(`text-${size}`, "text-sm"), "text-sm");
    assert.equal(cn("text-sm", `text-${size}`), `text-${size}`);
  }
  assert.equal(
    cn("text-heading-2", "text-primary", "text-heading-3"),
    "text-primary text-heading-3",
  );
});
