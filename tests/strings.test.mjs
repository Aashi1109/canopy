import { expect, test } from "vitest";
import { startCase } from "@/utils/strings.ts";

test("startCase formats labels while preserving acronyms", () => {
  for (const [input, expected] of [
    ["admin", "Admin"],
    ["assignRoles", "Assign Roles"],
    ["XMLParser", "XML Parser"],
    ["pdf-to_jpg", "Pdf To Jpg"],
    ["  already   readable  ", "Already Readable"],
    ["déjàVu", "Déjà Vu"],
    ["", ""],
    ["---", ""],
  ]) {
    expect(startCase(input), input).toBe(expected);
  }
});
