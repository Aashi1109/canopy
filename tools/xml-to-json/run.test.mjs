import { describe, expect, test } from "vitest";
import { run as fromXml } from "./run.ts";
import { context, execute, content } from "../../tests/helpers/json-tools.mjs";

test("converts repeated elements, attributes, mixed text and self-closing tags", async () => {
  const result = await execute(
    fromXml,
    '<?xml version="1.0"?><!-- comment --><root id="1"><item>A</item><item>B</item><empty/><text language="en">hello</text></root>',
  );
  expect(JSON.parse(result.text)).toEqual({
    root: { "@id": "1", item: ["A", "B"], empty: "", text: { "@language": "en", "#text": "hello" } },
  });
  expect(result.downloadName).toBe("converted-xml.json");
});
test.each(["", "plain text", "<root>", "<root></wrong>", "<a/><b/>"])("rejects incomplete XML %j", async (source) => {
  await expect(execute(fromXml, source)).rejects.toMatchObject({ message: expect.any(String) });
});

test("preserves greater-than characters inside quoted XML attributes", async () => {
  const result = await execute(fromXml, '<root label="A > B"><item>kept</item></root>');
  expect(JSON.parse(result.text)).toEqual({ root: { "@label": "A > B", item: "kept" } });
});

test("decodes predefined XML entities and character references as literal data", async () => {
  const result = await execute(
    fromXml,
    '<root label="&quot;Ada&quot; &amp; Lin">&lt;tag&gt;&apos; &#65; &#x1F600;</root>',
  );
  expect(JSON.parse(result.text)).toEqual({
    root: { "@label": '"Ada" & Lin', "#text": "<tag>' A 😀" },
  });
});

test("retains XML element names that also exist on JavaScript object prototypes", async () => {
  const result = await execute(fromXml, "<root><constructor>A</constructor><__proto__>B</__proto__></root>");
  expect(JSON.parse(result.text)).toEqual(JSON.parse('{"root":{"constructor":"A","__proto__":"B"}}'));
});

test("CDATA and escaped entity spellings are not decoded a second time", async () => {
  const result = await execute(fromXml, "<root><![CDATA[<raw>&amp;</raw>]]>&amp;lt;</root>");
  expect(JSON.parse(result.text)).toEqual({ root: "<raw>&amp;</raw>&lt;" });
});

test.each(["&#0;", "&#xD800;", "&#x110000;", "&custom;"])("rejects unsupported XML entity %s", async (entity) => {
  await expect(execute(fromXml, `<root>${entity}</root>`)).rejects.toMatchObject({ code: "xml-invalid-entity" });
});
