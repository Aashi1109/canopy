import { describe, expect, test } from "vitest";
import { run as unescape } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test.each(["", 'a"b\\c\n\r\t\b\f', "emoji 👋 / <script>", "\u0000\u0001", "\ud800"])(
  "unescapes arbitrary text %j from JSON string content",
  async (source) => {
    const result = await execute(unescape, JSON.stringify(source).slice(1, -1));
    expect(result.text).toBe(source);
    expect(result.downloadName).toBe("unescaped.txt");
  },
);

test.each(['bad"quote', "\\x20", "\\uZZZZ", "\\", "line\nbreak"])(
  "rejects invalid JSON string content %j",
  async (source) => {
    await expect(execute(unescape, source)).rejects.toMatchObject({
      code: "invalid-escape",
      recovery: expect.any(String),
    });
  },
);
