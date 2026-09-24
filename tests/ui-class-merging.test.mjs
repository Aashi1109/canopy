import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

import { cn } from "../components/ui/lib/utils.ts";

const root = new URL("../", import.meta.url);

test("shared UI class overrides are conflict-aware", async () => {
  const source = await readFile(new URL("components/ui/index.tsx", root), "utf8");

  expect(source).toMatch(/import \{ cn \} from ["']\.\/lib\/utils\.ts["']/);
  // ARIA id token lists (aria-describedby/aria-errormessage) are legitimately
  // space-joined; cn()/tailwind-merge is for classNames, not id references.
  const classJoins = source
    .split("\n")
    .filter(
      (line) => /filter\(Boolean\)\.join\(["'] ["']\)/.test(line) && !/aria-|describedBy|errorMessage/.test(line),
    );
  expect(classJoins).toEqual([]);
  expect(cn("h-10 p-6 text-sm", "h-9 p-0 text-xs")).toBe("h-9 p-0 text-xs");
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
    expect(cn(`text-${size}`, "text-foreground")).toBe(`text-${size} text-foreground`);
    expect(cn(`text-${size}`, "text-sm")).toBe("text-sm");
    expect(cn("text-sm", `text-${size}`)).toBe(`text-${size}`);
  }
  expect(cn("text-heading-2", "text-primary", "text-heading-3")).toBe("text-primary text-heading-3");
});
