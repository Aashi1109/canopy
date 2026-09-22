import assert from "node:assert/strict";
import test from "node:test";
import { contrast, suggestForeground } from "../tools/contrast-checker/model.ts";
import { run as checkContrast } from "../tools/contrast-checker/run.ts";
import { generatePalette, readPalette } from "../tools/palette-generator/model.ts";
import { run as exportPalette } from "../tools/palette-generator/run.ts";
import { parseSettings } from "../lib/tool-framework/settings.ts";
import contrastDefinition from "../tools/contrast-checker/definition.ts";
import paletteDefinition from "../tools/palette-generator/definition.ts";

test("contrast has exact WCAG bounds and composites transparent layers in order", () => {
  assert.equal(contrast("black", "white", "white").ratio, 21);
  assert.equal(contrast("white", "white", "white").ratio, 1);
  const value = contrast("rgb(0 0 0 / 50%)", "transparent", "white");
  assert.equal(value.foreground, "rgb(127.5 127.5 127.5)");
  assert.ok(value.ratio > 3.97 && value.ratio < 3.98);
  assert.throws(() => contrast("black", "white", "transparent"), /opaque/);
  assert.throws(() => contrast("garbage", "white", "white"));
  const report = checkContrast({ settings: { foreground: "#777", background: "white", canvas: "white" } });
  assert.equal(report.entries.find((row) => row.label === "AA · normal text").value, "Fail");
});

test("runtime setting parsing retains CSS colors and contrast preview preserves fractional channels", () => {
  const settings = parseSettings(contrastDefinition.settings, {
    foreground: "black",
    background: "white",
    canvas: "white",
  });
  assert.equal(checkContrast({ settings }).entries[0].value, "21.00:1");
  const value = contrast("rgb(0 0 0 / 0.5349)", "white", "white");
  assert.ok(value.ratio >= 4.5);
  assert.ok(Math.abs(contrast(value.foreground, value.background).ratio - value.ratio) < 1e-12);
  const paletteSettings = parseSettings(paletteDefinition.settings, { seed: "red" });
  assert.equal(exportPalette({ settings: paletteSettings }).tablePreview.rows[0][1], "#FF0000");
  const invalid = parseSettings(contrastDefinition.settings, { foreground: "invalid" });
  assert.throws(() => checkContrast({ settings: invalid }));
});

test("suggested foreground reaches the requested threshold on the actual background", () => {
  for (const background of ["white", "black", "#777", "#3366ff80"]) {
    const suggested = suggestForeground("#7799bb80", background, "white", 4.5);
    assert.ok(contrast(suggested, background, "white").ratio >= 4.5);
  }
});

test("palette generation is deterministic, respects count and keeps locked colors", () => {
  const palette = generatePalette("#3366ff", "analogous", 5, 0);
  assert.deepEqual(generatePalette("#3366ff", "analogous", 5, 0), palette);
  assert.equal(palette.length, 5);
  assert.equal(palette[0].color, "#3366FF");
  const previous = palette.map((item, index) => ({ ...item, locked: index === 2 }));
  const next = generatePalette("red", "triadic", 5, 1, previous);
  assert.deepEqual(next[2], previous[2]);
  assert.notEqual(next[1].color, previous[1].color);
  assert.throws(() => generatePalette("red", "analogous", 2, 0, previous), /Unlock/);
  assert.throws(() => generatePalette("red", "bogus", 5, 0));
  assert.throws(() => generatePalette("red", "analogous", 20, 0));
  assert.throws(() => readPalette('[{"id":"a","color":"red;url(x)"}]'));
});

test("palette export keeps order and produces usable CSS, JSON and SVG", () => {
  const settings = { seed: "#3366ff", harmony: "analogous", count: 3, variation: 0, colors: "", format: "css" };
  const result = exportPalette({ settings });
  assert.match(result.code, /--color-1: #3366FF;/);
  assert.equal(result.artifacts.length, 3);
  const json = result.artifacts.find((a) => a.name.endsWith(".json"));
  assert.equal(JSON.parse(json.content)[0].color, "#3366FF");
  const svg = result.artifacts.find((a) => a.name.endsWith(".svg"));
  assert.match(svg.content, /<svg/);
  assert.equal(result.tablePreview.rows.length, 3);
});
