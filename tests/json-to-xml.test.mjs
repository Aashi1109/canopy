import { expect, test } from "vitest";
import { run } from "../tools/json-to-xml/run.ts";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

const convert = (value) =>
  run({
    input: { text: JSON.stringify(value), files: [] },
    settings: { repairMode: "off" },
    signal: new AbortController().signal,
  });

test("JSON to XML indents nested objects and repeated array elements", () => {
  const result = convert({
    user: { name: "Ada", roles: ["admin", "owner"] },
    users: [{ name: "Lin" }, { name: "Sam", active: true }],
  });

  expect(result.render).toBe("text");
  expect(result.downloadName).toBe("converted.xml");
  expect(result.text).toBe(
    XML_DECLARATION +
      [
        "<root>",
        "  <user>",
        "    <name>Ada</name>",
        "    <roles>admin</roles>",
        "    <roles>owner</roles>",
        "  </user>",
        "  <users>",
        "    <name>Lin</name>",
        "  </users>",
        "  <users>",
        "    <name>Sam</name>",
        "    <active>true</active>",
        "  </users>",
        "</root>",
      ].join("\n"),
  );
});

test("JSON to XML preserves null, empty containers, and falsy scalar values", () => {
  const cases = [
    [null, "<root/>"],
    [{}, "<root></root>"],
    [[], ""],
    [false, "<root>false</root>"],
    [0, "<root>0</root>"],
    ["", "<root></root>"],
    [{ omitted: [] }, "<root></root>"],
    [
      { missing: null, empty: {}, omitted: [], blank: "", active: false, count: 0 },
      "<root>\n  <missing/>\n  <empty></empty>\n  <blank></blank>\n  <active>false</active>\n  <count>0</count>\n</root>",
    ],
  ];

  for (const [value, expected] of cases) {
    expect(convert(value).text, JSON.stringify(value)).toBe(XML_DECLARATION + expected);
  }
});

test("JSON to XML omits empty arrays without adding blank lines", () => {
  expect(convert({ items: [[], [1, 2], [], null, {}, ""], omitted: [], last: "end" }).text).toBe(
    XML_DECLARATION +
      "<root>\n  <items>1</items>\n  <items>2</items>\n  <items/>\n  <items></items>\n  <items></items>\n  <last>end</last>\n</root>",
  );
  expect(convert([{ name: "Ada" }, [], { name: "Lin" }]).text).toBe(
    XML_DECLARATION + "<root>\n  <name>Ada</name>\n</root>\n<root>\n  <name>Lin</name>\n</root>",
  );
});

test("JSON to XML preserves scalar whitespace while escaping special characters", () => {
  const value = '  <tag attr="x">&\'\n  next\r\n\tend  ';
  const escaped = "  &lt;tag attr=&quot;x&quot;&gt;&amp;&#39;\n  next\r\n\tend  ";

  expect(convert(value).text).toBe(XML_DECLARATION + `<root>${escaped}</root>`);
  expect(convert({ outer: { text: value } }).text).toBe(
    XML_DECLARATION + `<root>\n  <outer>\n    <text>${escaped}</text>\n  </outer>\n</root>`,
  );
});

test("JSON to XML retains safe tag names and falls back for invalid object keys", () => {
  expect(convert({ "bad key": 1, "1st": 2, "</root>": "x", "valid-name": 3, "valid.name": 4, _ok: 5 }).text).toBe(
    XML_DECLARATION +
      "<root>\n  <item>1</item>\n  <item>2</item>\n  <item>x</item>\n  <valid-name>3</valid-name>\n  <valid.name>4</valid.name>\n  <_ok>5</_ok>\n</root>",
  );
});
