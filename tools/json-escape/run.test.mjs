import { describe, expect, test } from "vitest";
import { run as escape } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", 'a"b\\c\n\r\t\b\f', "emoji 👋 / <script>", "\u0000\u0001", "\ud800"])(
  "escapes arbitrary text %j as JSON string content",
  async (source) => {
    const result = await execute(escape, source);
    expect(JSON.parse(`"${result.text}"`)).toBe(source);
  },
);
