import assert from "node:assert/strict";
import test from "node:test";

import { parseColor, parseHexColor, rgbToHex, rgbToHsl, hslToRgb } from "../lib/devtools/shared/color.ts";
import { run as hexToRgb } from "../tools/hex-to-rgb/run.ts";
import { run as rgbToHexRun } from "../tools/rgb-to-hex/run.ts";
import { run as hexToHsl } from "../tools/hex-to-hsl/run.ts";
import { run as colorPicker } from "../tools/color-picker/run.ts";
import { run as colorConverter } from "../tools/color-converter/run.ts";

const context = (text, settings = {}) => ({ input: { text, files: [] }, settings });

test("CSS color parsing supports HEX, names, modern and legacy RGB/HSL", () => {
  for (const [input, expected] of [
    ["#36f8", "#3366FF88"],
    ["3366ff", "#3366FF"],
    ["RebeccaPurple", "#663399"],
    ["lightgoldenrodyellow", "#FAFAD2"],
    ["transparent", "#00000000"],
    ["rgb(20%, 40%, 100%)", "#3366FF"],
    ["rgb(51 102 255 / 50%)", "#3366FF80"],
    ["rgba(.5, 0, 0, .5)", "#01000080"],
    ["rgb(1e2 0 0)", "#640000"],
    ["hsl(240 100% 50% / 0.5)", "#0000FF80"],
    ["hsla(-120, 100%, 50%, 50%)", "#0000FF80"],
    ["hsl(.5turn 100% 50%)", "#00FFFF"],
    ["hsl(200grad 100% 50%)", "#00FFFF"],
    [`hsl(${Math.PI}rad 100% 50%)`, "#00FFFF"],
  ])
    assert.equal(rgbToHex(parseColor(input)), expected, input);
  assert.deepEqual(hslToRgb(120, 100, 50), { red: 0, green: 255, blue: 0, alpha: 1 });
});

test("invalid or context-dependent CSS input is rejected rather than injected", () => {
  for (const input of [
    "",
    "#12",
    "#ggg",
    "rgb(1, 2 3)",
    "rgb(1 2)",
    "rgb(1, 2, 3 / .5)",
    "rgb(10%, 2, 3)",
    "hsl(0 50 50)",
    "rgb(Infinity 0 0)",
    "currentColor",
    "var(--color)",
    "red; background:url(x)",
    "rgb(1 2 3) garbage",
    "hsl(0 100% 50% /)",
    "rgb(300 -20 0 / 200%)",
    "hsl(0 200% -10%)",
  ])
    assert.throws(() => parseColor(input), undefined, input);
  assert.throws(() => parseHexColor("red"));
});

test("precise HSL preserves dark colors, fractional hue and representative RGB bytes", () => {
  for (const value of ["#010101", "#ff0100", "#3366ff", "#808080", "#000000", "#ffffff", "#12345680"]) {
    const original = parseHexColor(value);
    assert.equal(rgbToHex(parseColor(rgbToHsl(original))), rgbToHex(original), value);
    assert.equal(rgbToHex(parseColor(rgbToHsl(original, { syntax: "modern" }))), rgbToHex(original), value);
  }
  assert.match(rgbToHsl(parseHexColor("#ff0100")), /^hsl\(0\.235,/);
  assert.equal(hexToHsl(context("#010101")).text, "hsl(0, 0%, 0.392%)");
  assert.equal(hexToHsl(context("#010101", { roundPercentages: true })).text, "hsl(0, 0%, 0%)");
});

test("HEX and RGB converters interoperate with both syntaxes and preserve every alpha byte", () => {
  for (const commaSyntax of [true, false]) {
    for (let alpha = 0; alpha < 256; alpha++) {
      const hex = `#3366ff${alpha.toString(16).padStart(2, "0")}`;
      const rgb = hexToRgb(context(hex, { commaSyntax })).text;
      assert.equal(rgbToHexRun(context(rgb)).text, alpha === 255 ? "#3366FF" : hex.toUpperCase());
    }
  }
  assert.equal(
    rgbToHexRun(context("rgb(100% 0% 0% / 50%)", { includeAlpha: false, uppercaseOutput: false, addHashPrefix: false }))
      .text,
    "ff0000",
  );
});

test("converters keep batch successes, original line numbers and output choices", () => {
  const result = rgbToHexRun(context("rgb(255 0 0)\n\ninvalid\nrgba(0, 0, 255, .5)"));
  assert.deepEqual(result.items, ["#FF0000", "#0000FF80"]);
  assert.equal(result.issues[0].line, 3);
  assert.deepEqual(result.labels, ["rgb(255 0 0)", "rgba(0, 0, 255, .5)"]);
  assert.equal(hexToRgb(context("#f008", { outputFormat: "channels", commaSyntax: false })).text, "255 0 0 / 0.533");
  assert.equal(hexToHsl(context("#f008", { includeAlpha: false, outputFormat: "channels" })).text, "0, 100%, 50%");
});

test("picker accepts RGB, HSL and names without corrupting optional shorthand output", () => {
  for (const input of ["rgb(255 0 0)", "hsl(0 100% 50%)", "red"]) {
    const result = colorPicker(context(input, { normalizeShorthand: false }));
    assert.equal(result.entries.find((item) => item.label === "HEX").value, "#FF0000");
  }
  assert.equal(colorPicker(context("#f00", { normalizeShorthand: false })).entries[0].value, "#F00");
});

test("general converter handles reverse conversions, choices and mixed batches", () => {
  assert.equal(colorConverter(context("hsl(210 100% 50% / 25%)")).text, "#0080FF40");
  assert.equal(colorConverter(context("red", { outputFormat: "hsl", modernSyntax: true })).text, "hsl(0 100% 50%)");
  assert.equal(
    colorConverter(context("#f008", { outputFormat: "rgb", modernSyntax: false, includeAlpha: false })).text,
    "rgb(255, 0, 0)",
  );
  const result = colorConverter(context("red\ninvalid\nhsl(240 100% 50%)"));
  assert.deepEqual(result.items, ["#FF0000", "#0000FF"]);
  assert.equal(result.issues[0].line, 2);
});
