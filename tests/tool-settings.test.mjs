import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parsePageSelection, parseSettings } from "../lib/tool-framework/settings.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The closed union, read from the source rather than copied, so a new field
// kind cannot be added without this suite noticing.
const settingsSource = await readFile(path.join(ROOT, "lib/tool-framework/settings.ts"), "utf8");
const FIELD_KINDS = new Set(
  [
    ...(/export type FieldSpec =([\s\S]*?)\nexport type FieldKind/.exec(settingsSource)?.[1] ?? "").matchAll(
      /kind:\s*"([a-z]+)"/g,
    ),
  ].map((match) => match[1]),
);

/**
 * Inline fixture covering every field kind. Migrated tool specs are checked
 * against the same assertions below; this fixture is what gives the suite real
 * coverage before any tool has landed on the new contract.
 */
const FIXTURE = {
  fields: {
    title: { kind: "text", label: "Title", default: "Report", maxLength: 20 },
    notes: { kind: "textarea", label: "Notes", default: "" },
    secret: { kind: "password", label: "Secret", default: "" },
    copies: { kind: "number", label: "Copies", default: 3, min: 1, max: 10 },
    quality: { kind: "slider", label: "Quality", default: 80, min: 0, max: 100 },
    flatten: { kind: "toggle", label: "Flatten", default: true },
    format: {
      kind: "select",
      label: "Format",
      default: "png",
      choices: [
        { label: "PNG", value: "png" },
        { label: "JPEG", value: "jpeg" },
      ],
    },
    preset: {
      kind: "preset",
      label: "Preset",
      default: "web",
      choices: [
        { label: "Web", value: "web", detail: "72dpi" },
        { label: "Print", value: "print" },
      ],
    },
    tint: { kind: "color", label: "Tint", default: "#ff0000" },
    backdrop: {
      kind: "color",
      label: "Backdrop",
      default: "transparent",
      allowTransparent: true,
    },
    issued: { kind: "date", label: "Issued", default: "2026-01-31" },
    anchor: { kind: "position", label: "Anchor", default: "bottom-right" },
    pages: { kind: "pages", label: "Pages", default: "all" },
    subset: { kind: "pages", label: "Subset", default: [1, 3, 5] },
    // `visibleWhen` must point at a sibling key in the same spec.
    watermark: {
      kind: "text",
      label: "Watermark",
      default: "",
      visibleWhen: { key: "flatten", equals: true },
    },
    headers: {
      kind: "rows",
      label: "Headers",
      default: [{ key: "x", value: "1" }],
      keyLabel: "Key",
      valueLabel: "Value",
    },
  },
};

// ---------------------------------------------------------------------------
// Spec-shape invariants — run against the fixture and every migrated tool spec.
// ---------------------------------------------------------------------------

const TOOLS_DIR = path.join(ROOT, "tools");
const migratedSpecs = [];
for (const entry of await readdir(TOOLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const definitionPath = path.join(TOOLS_DIR, entry.name, "definition.ts");
  let source;
  try {
    source = await readFile(definitionPath, "utf8");
  } catch {
    continue;
  }
  if (!/^\s*export\s+default\b/m.test(source)) continue; // not migrated yet
  const spec = (await import(definitionPath)).default;
  if (spec?.settings) {
    migratedSpecs.push([entry.name, spec.settings, spec.content?.examples ?? []]);
  }
}

const specsUnderTest = [["<fixture>", FIXTURE], ...migratedSpecs];

test("every field declares a kind from the closed union", () => {
  assert.ok(FIELD_KINDS.size > 0, "FieldSpec union must be parseable");
  for (const [name, spec] of specsUnderTest) {
    for (const [key, field] of Object.entries(spec.fields)) {
      assert.ok(FIELD_KINDS.has(field.kind), `${name}.${key}: unknown kind "${field.kind}"`);
    }
  }
  // The fixture must keep exercising the whole union.
  const covered = new Set(Object.values(FIXTURE.fields).map((field) => field.kind));
  assert.deepEqual(
    [...FIELD_KINDS].filter((kind) => !covered.has(kind)),
    [],
    "the fixture must cover every field kind",
  );
});

test("visibleWhen points at a key in the same spec", () => {
  for (const [name, spec] of specsUnderTest) {
    for (const [key, field] of Object.entries(spec.fields)) {
      if (!field.visibleWhen) continue;
      assert.ok(
        Object.hasOwn(spec.fields, field.visibleWhen.key),
        `${name}.${key}: visibleWhen references unknown key "${field.visibleWhen.key}"`,
      );
      assert.notEqual(field.visibleWhen.key, key, `${name}.${key}: visibleWhen is self-referential`);
    }
  }
});

test("select and preset choices are non-empty and contain the default", () => {
  for (const [name, spec] of specsUnderTest) {
    for (const [key, field] of Object.entries(spec.fields)) {
      if (field.kind !== "select" && field.kind !== "preset") continue;
      assert.ok(field.choices.length > 0, `${name}.${key}: choices must be non-empty`);
      assert.ok(
        field.choices.some((choice) => choice.value === field.default),
        `${name}.${key}: default "${field.default}" is not among the choices`,
      );
    }
  }
});

test("declared defaults round-trip through parseSettings unchanged", () => {
  for (const [name, spec] of specsUnderTest) {
    const defaults = Object.fromEntries(Object.entries(spec.fields).map(([key, field]) => [key, field.default]));
    assert.deepEqual(
      parseSettings(spec, defaults),
      defaults,
      `${name}: defaults must survive a parse (check maxLength truncation and min/max clamping)`,
    );
    // Absent input must produce the same settings as explicit defaults.
    assert.deepEqual(parseSettings(spec, {}), defaults, `${name}: empty input must yield defaults`);
  }
});

test("example settings reference declared fields and survive parsing", () => {
  for (const [name, spec, examples] of migratedSpecs) {
    for (const example of examples) {
      if (!example.settings) continue;
      const parsed = parseSettings(spec, example.settings);
      for (const [key, value] of Object.entries(example.settings)) {
        assert.ok(
          Object.hasOwn(spec.fields, key),
          `${name}: example "${example.label}" references unknown setting "${key}"`,
        );
        assert.deepEqual(parsed[key], value, `${name}: example "${example.label}" has an invalid value for "${key}"`);
      }
    }
  }
});

test("pages defaults parse", () => {
  for (const [name, spec] of specsUnderTest) {
    for (const [key, field] of Object.entries(spec.fields)) {
      if (field.kind !== "pages") continue;
      const parsed = parseSettings(spec, { [key]: field.default })[key];
      assert.ok(
        parsed === "all" || (Array.isArray(parsed) && parsed.length > 0),
        `${name}.${key}: pages default did not parse`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Trust boundary. `raw` arrives from postMessage and HTTP.
// ---------------------------------------------------------------------------

const HOSTILE_ROOTS = [
  null,
  undefined,
  "not an object",
  42,
  true,
  [],
  [{ title: "x" }],
  Symbol.iterator,
  () => {},
  new Map([["title", "x"]]),
  { unknownKey: "ignored", anotherJunkKey: { nested: true } },
  JSON.parse('{"__proto__": {"polluted": true}}'),
];

test("parseSettings never throws on hostile input and always returns defaults", () => {
  const defaults = Object.fromEntries(Object.entries(FIXTURE.fields).map(([key, field]) => [key, field.default]));
  for (const raw of HOSTILE_ROOTS) {
    let parsed;
    assert.doesNotThrow(
      () => {
        parsed = parseSettings(FIXTURE, raw);
      },
      `threw on ${String(raw)}`,
    );
    assert.deepEqual(
      Object.keys(parsed).sort(),
      Object.keys(FIXTURE.fields).sort(),
      `${String(raw)}: result must declare exactly the spec's keys`,
    );
    assert.deepEqual(parsed, defaults, `${String(raw)}: must fall back to defaults`);
  }
});

test("wrong-typed values fall back to the declared default", () => {
  const hostile = {
    title: 123,
    notes: [],
    secret: { toString: () => "leak" },
    copies: "not a number",
    quality: Number.NaN,
    flatten: "maybe",
    format: "gif",
    preset: "",
    tint: "red",
    backdrop: "#zzzzzz",
    issued: "31-01-2026",
    anchor: "outer-space",
    pages: {},
    subset: [0, -1],
    watermark: null,
    headers: [{ key: 1, value: 2 }],
  };
  const parsed = parseSettings(FIXTURE, hostile);
  for (const [key, field] of Object.entries(FIXTURE.fields)) {
    assert.deepEqual(parsed[key], field.default, `${key}: wrong type must fall back`);
  }
});

test("numbers clamp to min and max instead of escaping the range", () => {
  const low = parseSettings(FIXTURE, { copies: -999, quality: -1 });
  assert.equal(low.copies, 1);
  assert.equal(low.quality, 0);

  const high = parseSettings(FIXTURE, { copies: 1e9, quality: 1000 });
  assert.equal(high.copies, 10);
  assert.equal(high.quality, 100);

  // Numeric strings from an HTML form or a query string are still clamped.
  assert.equal(parseSettings(FIXTURE, { copies: "42" }).copies, 10);
  // Non-finite input is not a number.
  assert.equal(parseSettings(FIXTURE, { copies: Number.POSITIVE_INFINITY }).copies, 3);
});

test("text is truncated to maxLength rather than rejected", () => {
  const long = "x".repeat(500);
  assert.equal(parseSettings(FIXTURE, { title: long }).title.length, 20);
  // textarea and password have no length bound and must not silently truncate.
  assert.equal(parseSettings(FIXTURE, { notes: long }).notes.length, 500);
});

test("out-of-choice select and preset values fall back", () => {
  assert.equal(parseSettings(FIXTURE, { format: "jpeg" }).format, "jpeg");
  assert.equal(parseSettings(FIXTURE, { format: "exe" }).format, "png");
  assert.equal(parseSettings(FIXTURE, { preset: "print" }).preset, "print");
  assert.equal(parseSettings(FIXTURE, { preset: "__proto__" }).preset, "web");
});

test("pages accepts expressions, lists and 'all', and rejects junk", () => {
  assert.equal(parseSettings(FIXTURE, { pages: "all" }).pages, "all");
  assert.deepEqual(parseSettings(FIXTURE, { pages: "1,3,5-7" }).pages, [1, 3, 5, 6, 7]);
  assert.deepEqual(parseSettings(FIXTURE, { pages: [2, 2, 4] }).pages, [2, 4]);
  assert.equal(parseSettings(FIXTURE, { pages: "3-1" }).pages, "all");
  assert.deepEqual(parseSettings(FIXTURE, { subset: [1.5] }).subset, [1, 3, 5]);
});

test("parsePageSelection is total over untrusted strings", () => {
  assert.equal(parsePageSelection("all"), "all");
  assert.deepEqual(parsePageSelection(""), []);
  assert.deepEqual(parsePageSelection("   "), []);
  assert.deepEqual(parsePageSelection("banana"), []);
  assert.deepEqual(parsePageSelection("0"), []);
  assert.deepEqual(parsePageSelection("-1"), []);
  assert.deepEqual(parsePageSelection("1-999999999"), [], "unbounded ranges must not allocate");
  assert.deepEqual(parsePageSelection("1,1,2"), [1, 2], "duplicates collapse");
  assert.deepEqual(parsePageSelection("odd"), [], "odd needs a page count");
  assert.deepEqual(parsePageSelection("odd", 5), [1, 3, 5]);
  assert.deepEqual(parsePageSelection("even", 5), [2, 4]);
  assert.deepEqual(parsePageSelection("1-9", 5), [], "a range past the end is rejected");
});

test("rows only accept well-formed key/value pairs", () => {
  assert.deepEqual(parseSettings(FIXTURE, { headers: [] }).headers, []);
  assert.deepEqual(parseSettings(FIXTURE, { headers: [{ key: "a", value: "b" }] }).headers, [{ key: "a", value: "b" }]);
  assert.deepEqual(parseSettings(FIXTURE, { headers: ["a=b"] }).headers, [{ key: "x", value: "1" }]);
});

test("colors and dates are validated, not echoed", () => {
  assert.equal(parseSettings(FIXTURE, { tint: "#0f0" }).tint, "#0f0");
  assert.equal(parseSettings(FIXTURE, { tint: "javascript:alert(1)" }).tint, "#ff0000");
  assert.equal(parseSettings(FIXTURE, { backdrop: "transparent" }).backdrop, "transparent");
  assert.equal(parseSettings(FIXTURE, { tint: "transparent" }).tint, "#ff0000");
  assert.equal(parseSettings(FIXTURE, { issued: "not-a-date" }).issued, "2026-01-31");
  assert.equal(parseSettings(FIXTURE, { issued: "2026-13-01" }).issued, "2026-01-31");
  assert.equal(parseSettings(FIXTURE, { issued: "2026-12-01" }).issued, "2026-12-01");
});

test("settings.ts hardening", async (t) => {
  await t.test("date fields reject impossible calendar days", () => {
    // `Date.parse("2026-02-30")` rolls over to March 2 instead of returning
    // NaN, so the value has to be round-tripped to be rejected.
    assert.equal(parseSettings(FIXTURE, { issued: "2026-02-30" }).issued, "2026-01-31");
    assert.equal(parseSettings(FIXTURE, { issued: "2025-02-29" }).issued, "2026-01-31");
    assert.equal(parseSettings(FIXTURE, { issued: "2026-04-31" }).issued, "2026-01-31");
    assert.equal(parseSettings(FIXTURE, { issued: "2024-02-29" }).issued, "2024-02-29");
  });
  await t.test("settings are read as own properties only", () => {
    // A caller-constructed object with a poisoned prototype must not supply
    // values. Not reachable through postMessage or JSON.parse today (neither
    // preserves a prototype), so this is hardening, not a live hole.
    const poisoned = Object.create({ title: "injected", copies: 999 });
    assert.equal(parseSettings(FIXTURE, poisoned).title, FIXTURE.fields.title.default);
    assert.equal(parseSettings(FIXTURE, poisoned).copies, FIXTURE.fields.copies.default);
  });
});

test("parseSettings does not mutate the spec or the raw input", () => {
  const raw = { title: "kept", copies: 999 };
  const snapshot = structuredClone(raw);
  const specSnapshot = structuredClone(FIXTURE);
  parseSettings(FIXTURE, raw);
  assert.deepEqual(raw, snapshot);
  assert.deepEqual(FIXTURE, specSnapshot);
});
