import { expect, test } from "vitest";
import { readToolFile } from "../lib/tool-framework/media/fileBytes.ts";

test("readToolFile releases a completed full-file read instead of caching it", async () => {
  let reads = 0;
  const source = {
    async arrayBuffer() {
      reads += 1;
      return Uint8Array.of(reads).buffer;
    },
  };
  const file = {
    id: "input",
    name: "input.bin",
    mime: "application/octet-stream",
    size: 1,
    source,
  };

  expect(new Uint8Array(await readToolFile(file))).toEqual(Uint8Array.of(1));
  expect(new Uint8Array(await readToolFile(file))).toEqual(Uint8Array.of(2));
  expect(reads).toBe(2);
});
