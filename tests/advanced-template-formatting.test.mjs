import { expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { supportsAdvancedTextBold, withPdfmeTextFormatting } from "../lib/invoice-templates/pdfmeTextFormatting.ts";

function textSchema(overrides = {}) {
  return {
    name: "label",
    type: "text",
    content: "Stored fallback",
    position: { x: 10, y: 10 },
    width: 150,
    height: 20,
    fontSize: 12,
    alignment: "left",
    verticalAlignment: "top",
    fontColor: "#000000",
    lineHeight: 1,
    characterSpacing: 0,
    ...overrides,
  };
}

function mockPlugin(overrides = {}) {
  return {
    pdf: vi.fn(),
    ui: vi.fn(),
    propPanel: { defaultSchema: textSchema(), schema: {} },
    uninterruptedEditMode: true,
    ...overrides,
  };
}

test("bold availability is limited to ordinary text without changing other plugin types", () => {
  expect(supportsAdvancedTextBold(textSchema())).toBe(true);
  expect(supportsAdvancedTextBold(textSchema({ textFormat: "plain", readOnly: false }))).toBe(true);
  for (const schema of [
    null,
    undefined,
    textSchema({ type: "multiVariableText" }),
    textSchema({ type: "image" }),
    textSchema({ textFormat: "inline-markdown" }),
    textSchema({ textFormat: "unknown" }),
  ]) {
    expect(supportsAdvancedTextBold(schema)).toBe(false);
  }
});

test("bold PDF rendering preserves resolved literal text and leaves bindings and font variants unchanged", async () => {
  const original = mockPlugin();
  const plugin = withPdfmeTextFormatting(original);
  const schema = textSchema({
    fontWeight: "bold",
    readOnly: false,
    fontVariants: { bold: "Roboto", italic: "Other italic font" },
  });
  const before = structuredClone(schema);
  const props = { schema, value: "Literal *stars* ~~tilde~~ `code` [link](url) \\ path" };
  await plugin.pdf(props);

  const rendered = original.pdf.mock.calls[0][0];
  expect(rendered.value).toBe("**Literal \\*stars\\* \\~\\~tilde\\~\\~ \\`code\\` \\[link\\]\\(url\\) \\\\ path**");
  expect(rendered.schema).toMatchObject({
    readOnly: true,
    textFormat: "inline-markdown",
    fontVariantFallback: "synthetic",
    fontVariants: { italic: "Other italic font" },
  });
  expect(rendered.schema.fontVariants).not.toHaveProperty("bold");
  expect(rendered.schema).not.toBe(schema);
  expect(schema).toEqual(before);
  expect(props.value).toBe("Literal *stars* ~~tilde~~ `code` [link](url) \\ path");
  expect(plugin.propPanel).toBe(original.propPanel);
  expect(plugin.uninterruptedEditMode).toBe(true);
});

test("non-bold, markdown and non-text render calls, and empty PDFs, are delegated unchanged", async () => {
  const original = mockPlugin();
  const plugin = withPdfmeTextFormatting(original);
  for (const [schema, value] of [
    [textSchema(), "Plain"],
    [textSchema({ fontWeight: "normal" }), "Normal"],
    [textSchema({ fontWeight: "bold", textFormat: "inline-markdown" }), "*Formatted*"],
    [textSchema({ fontWeight: "bold", type: "multiVariableText" }), '{"name":"Value"}'],
  ]) {
    const props = { schema, value, rootElement: { querySelector: vi.fn() } };
    await plugin.pdf(props);
    await plugin.ui(props);
    expect(original.pdf.mock.calls.at(-1)[0]).toBe(props);
    expect(original.ui.mock.calls.at(-1)[0]).toBe(props);
    expect(props.rootElement.querySelector).not.toHaveBeenCalled();
  }
  const emptyPdf = { schema: textSchema({ fontWeight: "bold" }), value: "" };
  await plugin.pdf(emptyPdf);
  expect(original.pdf.mock.calls.at(-1)[0]).toBe(emptyPdf);
});

test("bold canvas styling keeps native editable text and input updates intact", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const document = dom.window.document;
  const onChange = vi.fn();
  const original = mockPlugin({
    ui: vi.fn(async (props) => {
      const text = document.createElement("div");
      text.id = "text-label";
      text.contentEditable = "true";
      text.textContent = props.value;
      text.addEventListener("blur", () => props.onChange({ key: "content", value: text.textContent }));
      props.rootElement.replaceChildren(text);
    }),
  });
  const plugin = withPdfmeTextFormatting(original);
  const schema = textSchema({ fontWeight: "bold", readOnly: false });
  const props = { schema, value: "Editable [literal] *text*", rootElement: document.getElementById("root"), onChange };
  await plugin.ui(props);
  const text = props.rootElement.firstElementChild;
  expect(original.ui.mock.calls[0][0]).toBe(props);
  expect(text.style.fontWeight).toBe("800");
  expect(text.style.textShadow).toBe("0.025em 0 0 currentColor");
  expect(text.contentEditable).toBe("true");
  expect(text.textContent).toBe(props.value);
  expect(schema.readOnly).toBe(false);
  text.textContent = "Updated *literal*";
  text.dispatchEvent(new dom.window.Event("blur"));
  expect(onChange).toHaveBeenCalledWith({ key: "content", value: "Updated *literal*" });

  await plugin.ui({ ...props, value: "Updated *literal*", schema: { ...schema, fontWeight: "normal" } });
  const normalText = props.rootElement.firstElementChild;
  expect(normalText).not.toBe(text);
  expect(normalText.style.fontWeight).toBe("");
  expect(normalText.style.textShadow).toBe("");
  expect(normalText.contentEditable).toBe("true");
  expect(normalText.textContent).toBe("Updated *literal*");

  await plugin.ui({ ...props, value: "" });
  const emptyText = props.rootElement.firstElementChild;
  expect(emptyText.textContent).toBe("");
  expect(emptyText.style.fontWeight).toBe("800");
  expect(emptyText.style.textShadow).toBe("0.025em 0 0 currentColor");
  expect(emptyText.contentEditable).toBe("true");
  emptyText.textContent = "Starts bold before blur";
  expect(emptyText.style.fontWeight).toBe("800");
  emptyText.dispatchEvent(new dom.window.Event("blur"));
  expect(onChange).toHaveBeenCalledWith({ key: "content", value: "Starts bold before blur" });
  dom.window.close();
});

test("the native markdown renderer preserves literal whitespace and newlines in bold values", async () => {
  const { text } = await import("@pdfme/schemas");
  const dom = new JSDOM("<div id='root'></div>");
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;
  const rootElement = dom.window.document.getElementById("root");
  const plugin = withPdfmeTextFormatting(
    mockPlugin({
      pdf: (props) =>
        text.ui({
          ...props,
          mode: "viewer",
          rootElement,
          options: {},
          _cache: new Map(),
          basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0] },
        }),
    }),
  );

  try {
    for (const value of ["   leading and trailing   ", "\n first *line*\nsecond [line](url)  \n", " \n \n "]) {
      await plugin.pdf({ schema: textSchema({ fontWeight: "bold" }), value });
      expect(rootElement.textContent).toBe(value);
      expect(rootElement.querySelector('div[id^="text-"] span').style.fontWeight).toBe("800");
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});

test("real PDF generation resolves bound bold text and draws synthetic weight", async () => {
  const [{ generate }, { text }] = await Promise.all([import("@pdfme/generator"), import("@pdfme/schemas")]);
  const plugin = withPdfmeTextFormatting(text);
  const renders = [];
  const schema = textSchema({ fontWeight: "bold", readOnly: false });
  const template = { basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0] }, schemas: [[schema]] };
  async function generateText(selectedTemplate) {
    return generate({
      template: selectedTemplate,
      inputs: [{ label: "Bound [literal] *value*" }],
      plugins: {
        text: {
          ...plugin,
          pdf: (props) => {
            renders.push({ value: props.value, readOnly: props.schema.readOnly });
            return plugin.pdf(props);
          },
        },
      },
    });
  }
  const bytes = await generateText(template);
  expect(renders).toEqual([{ value: "Bound [literal] *value*", readOnly: false }]);
  expect(schema.readOnly).toBe(false);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  function textDrawCount(document) {
    const contents = document.getPages()[0].node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const commands = streams
      .map((stream) =>
        Buffer.from(decodePDFRawStream(document.context.lookup(stream, PDFRawStream)).decode()).toString(),
      )
      .join("\n");
    return commands.match(/\bTj\b/g)?.length ?? 0;
  }
  const normalTemplate = { ...template, schemas: [[{ ...schema, fontWeight: "normal" }]] };
  const normalPdf = await PDFDocument.load(await generateText(normalTemplate));
  const normalDraws = textDrawCount(normalPdf);
  expect(normalDraws).toBeGreaterThan(0);
  expect(textDrawCount(pdf)).toBeGreaterThan(normalDraws);
});
