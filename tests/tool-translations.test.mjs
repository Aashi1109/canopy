import { describe, it, expect } from "vitest";
import { translateToolResult } from "../lib/tool-framework/result.ts";
import {
  extractToolMessages,
  applyToolMessages,
  validateToolTranslation,
  resolveToolTranslation,
  formatToolMessage,
  toolMessageTree,
} from "../lib/tool-framework/translations.ts";

const spec = {
  toolId: "devtools.future-tool",
  app: "devtools",
  category: "json-tools",
  name: "Future tool",
  description: "Read a user's {JSON}.",
  keywords: ["json"],
  input: { kind: "text", label: "Source", language: "json", placeholder: '{"name":"example"}' },
  settings: {
    fields: { mode: { kind: "select", label: "Mode", default: "a.b", choices: [{ value: "a.b", label: "Readable" }] } },
  },
  trigger: { mode: "manual", actionLabel: "Run" },
  labels: { empty: "Paste source.", ready: "Ready.", running: "Reading…" },
  messages: { "results.count": "{count, plural, one {# file} other {# files}}", greeting: "Hello {name}" },
  content: {
    howToUse: ["Paste {JSON}."],
    examples: [{ label: "Example", text: '{"name":"{name}"}', settings: { mode: "a.b" } }],
  },
};

it("translates diff labels and image descriptions without changing generated output", () => {
  const original = {
    render: "text",
    text: "--- before\n+++ after\n+{name}",
    diffPreview: {
      render: "diff",
      lines: [{ kind: "added", text: "{name}" }],
      leftLabel: "Original",
      rightLabel: "Changed",
      leftLabelMessage: { key: "before" },
      rightLabelMessage: { key: "after" },
    },
    sections: [
      {
        title: "Image",
        body: {
          render: "image",
          src: "data:image/png;base64,AA==",
          mime: "image/png",
          alt: "Generated",
          altMessage: { key: "image" },
        },
      },
    ],
  };
  const translated = translateToolResult(
    original,
    ({ key }) => ({ before: "पहले", after: "बाद में", image: "तस्वीर" })[key],
  );
  expect(translated.text).toBe(original.text);
  expect(translated.diffPreview.lines).toEqual(original.diffPreview.lines);
  expect(translated.diffPreview.leftLabel).toBe("पहले");
  expect(translated.diffPreview.rightLabel).toBe("बाद में");
  expect(translated.sections[0].body.alt).toBe("तस्वीर");
  expect(translated.sections[0].body.src).toBe(original.sections[0].body.src);
});

describe("embedded tool messages", () => {
  it("extracts display text while preserving source code, option values and execution defaults", () => {
    const messages = extractToolMessages(spec);
    expect(messages["settings.mode.choices.a%2Eb.label"]).toBe("Readable");
    expect(messages).not.toHaveProperty("input.placeholder");
    expect(Object.keys(messages).some((key) => key.endsWith(".text"))).toBe(false);
    const localized = applyToolMessages(spec, { ...messages, name: "नया उपकरण", "input.label": "स्रोत" }, "hi");
    expect(localized.name).toBe("नया उपकरण");
    expect(localized.input.label).toBe("स्रोत");
    expect(localized.description).toBe(spec.description);
    expect(localized.input.placeholder).toBe(spec.input.placeholder);
    expect(localized.content.examples[0].text).toBe(spec.content.examples[0].text);
    expect(localized.settings.fields.mode.default).toBe("a.b");
    expect(localized.settings.fields.mode.choices[0].value).toBe("a.b");
    expect(spec.input.label).toBe("Source");
  });
  it("uses native interpolation and plural rules without interpreting injected values recursively", () => {
    expect(formatToolMessage("en", spec.messages["results.count"], { count: 2 })).toBe("2 files");
    expect(formatToolMessage("en", spec.messages.greeting, { name: "{count}" })).toBe("Hello {count}");
  });
  it("allows incomplete drafts but rejects incomplete publication and malformed or incompatible messages", () => {
    const english = extractToolMessages(spec);
    expect(validateToolTranslation("hi", { name: "उपकरण" }, english, { publish: false })).toEqual([]);
    expect(validateToolTranslation("hi", { name: "उपकरण" }, english, { publish: true }).length).toBeGreaterThan(0);
    expect(
      validateToolTranslation("hi", { "runtime.greeting": "Hello {wrong}" }, english, { publish: false }).length,
    ).toBeGreaterThan(0);
    expect(validateToolTranslation("hi", { name: "{broken" }, english, { publish: false }).length).toBeGreaterThan(0);
    expect(validateToolTranslation("xx", {}, english, { publish: false }).length).toBeGreaterThan(0);
  });
  it("does not expose draft or incomplete translations and requires published English", () => {
    const english = extractToolMessages(spec);
    const translations = {
      en: { status: "published", messages: english },
      hi: { status: "draft", messages: { ...english, name: "उपकरण" } },
    };
    expect(resolveToolTranslation(translations, "hi", english)).toBeNull();
    translations.hi.status = "published";
    expect(resolveToolTranslation(translations, "hi", english).messages.name).toBe("उपकरण");
    expect(resolveToolTranslation(translations, "hi", english).availableLocales).toEqual(["en", "hi"]);
    translations.en.status = "draft";
    expect(resolveToolTranslation(translations, "hi", english)).toBeNull();
  });
  it("rejects unexpected and unsafe keys and invalidates old adapters with newly required text", () => {
    const english = extractToolMessages(spec);
    expect(
      validateToolTranslation("en", JSON.parse('{"__proto__.polluted":"x"}'), english, { publish: false }).length,
    ).toBeGreaterThan(0);
    const translations = { en: { status: "published", messages: english } };
    expect(resolveToolTranslation(translations, "en", { ...english, "runtime.newAction": "New action" })).toBeNull();
  });
  it("preserves selection branches while allowing language-specific plural categories", () => {
    const english = {
      message:
        "{count, plural, one {{mode, select, saved {# saved file} other {# file}}} other {{mode, select, saved {# saved files} other {# files}}}}",
    };
    const arabic =
      "{count, plural, zero {{mode, select, saved {محفوظ} other {ملف}}} one {{mode, select, saved {محفوظ} other {ملف}}} two {{mode, select, saved {محفوظ} other {ملف}}} few {{mode, select, saved {محفوظ} other {ملف}}} many {{mode, select, saved {محفوظ} other {ملف}}} other {{mode, select, saved {محفوظ} other {ملف}}}}";
    expect(validateToolTranslation("ar", { message: arabic }, english, { publish: true })).toEqual([]);
    expect(
      validateToolTranslation("ar", { message: arabic.replaceAll("saved {", "wrong {") }, english, { publish: true }),
    ).not.toEqual([]);
    const withExact = { message: "{count, plural, offset:1 =0 {None} one {One more} other {# more}}" };
    expect(
      validateToolTranslation("en", { message: "{count, plural, one {One} other {#}}" }, withExact, { publish: true }),
    ).not.toEqual([]);
  });
  it("creates serializable nested messages without touching object prototypes", () => {
    const tree = toolMessageTree({
      "runtime.greeting": "Hello {name}",
      "runtime.toString": "Literal name",
      "__proto__.polluted": "bad",
    });
    expect(Object.getPrototypeOf(tree)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(tree.runtime)).toBe(Object.prototype);
    expect(tree.runtime.toString).toBe("Literal name");
    expect({}.polluted).toBeUndefined();
    expect(JSON.parse(JSON.stringify(tree)).runtime.greeting).toBe("Hello {name}");
  });
  it("formats result metadata from an unknown tool without changing its data or artifacts", () => {
    const artifact = { id: "result", name: "result.json", mime: "application/json", content: '{"name":"{name}"}' };
    const result = {
      render: "text",
      text: '{"name":"{name}"}',
      artifacts: [artifact],
      verdict: { level: "ok", label: "Complete", labelMessage: { key: "done" } },
      sections: [
        {
          title: "Details",
          titleMessage: { key: "details" },
          body: {
            render: "key-value",
            entries: [{ label: "Files", value: 2, labelMessage: { key: "files", values: { count: 2 } } }],
          },
        },
      ],
    };
    const messages = { done: "पूर्ण", details: "विवरण", files: "{count, plural, one {# फ़ाइल} other {# फ़ाइलें}}" };
    const localized = translateToolResult(result, (message) =>
      formatToolMessage("hi", messages[message.key], message.values),
    );
    expect(localized.verdict.label).toBe("पूर्ण");
    expect(localized.sections[0].title).toBe("विवरण");
    expect(localized.sections[0].body.entries[0].label).toBe("Files");
    expect(localized.sections[0].body.entries[0].labelMessage.values).toEqual({ count: 2 });
    expect(localized.text).toBe(result.text);
    expect(localized.artifacts[0]).toBe(artifact);
    expect(result.sections[0].body.entries[0].label).toBe("Files");
  });
});
