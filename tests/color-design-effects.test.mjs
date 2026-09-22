import assert from "node:assert/strict";
import test from "node:test";
import { run as gradient } from "../tools/gradient-generator/run.ts";
import { run as shadow } from "../tools/css-box-shadow/run.ts";

const context = (text, settings, secondary = "") => ({
  input: { text, secondary, files: [] },
  settings,
  signal: new AbortController().signal,
});
const stop = (id, color, position) => ({ id, color, position });
const layer = (id, values = {}) => ({
  id,
  color: "#00000080",
  x: 0,
  y: 8,
  blur: 20,
  spread: -4,
  inset: false,
  enabled: true,
  ...values,
});

test("gradient preserves legacy declarations and normalizes bare HEX", () => {
  assert.equal(
    gradient(context("#2563eb", { type: "linear", angle: 135 }, "#7c3aed")).text,
    "background: linear-gradient(135deg, #2563eb, #7c3aed);",
  );
  assert.equal(
    gradient(context("fff", { type: "radial" }, "000")).text,
    "background: radial-gradient(circle, #fff, #000);",
  );
});

test("gradient emits explicit sorted stops, transparency, and radial geometry", () => {
  const result = gradient(
    context(
      "#fff",
      {
        type: "radial",
        radialShape: "ellipse",
        radialX: 25,
        radialY: 75,
        includeFallback: true,
        stops: JSON.stringify([stop("b", "#0000", 100), stop("a", "#F00", 0), stop("c", "#00F", 40)]),
      },
      "#000",
    ),
  );
  assert.equal(
    result.text,
    "background: #FF0000;\nbackground: radial-gradient(ellipse at 25% 75%, #FF0000 0%, #0000FF 40%, #00000000 100%);",
  );
  assert.equal(result.downloadName, "gradient.css");
});

test("gradient rejects malformed stops and CSS injection", () => {
  for (const stops of [
    "{",
    "[]",
    JSON.stringify([stop("a", "#fff; color:red", 0), stop("b", "#000", 100)]),
    JSON.stringify([stop("a", "#fff", -1), stop("b", "#000", 100)]),
  ]) {
    assert.throws(() => gradient(context("#fff", { type: "linear", angle: 90, stops }, "#000")));
  }
});

test("shadow preserves legacy layers, prefixes, and linked opacity", () => {
  assert.equal(
    shadow(context("000", { x: -3, y: 2, blur: 0, spread: -4, inset: true })).text,
    "box-shadow: -3px 2px 0px -4px #000 inset;",
  );
  const result = shadow(
    context("#00000080", {
      x: 0,
      y: 12,
      blur: 30,
      spread: -8,
      additionalLayers: "0 2px 4px rgba(10, 20, 30, 0.2)",
      linkOpacity: true,
      showBrowserPrefixes: true,
    }),
  );
  assert.match(result.text, /^-webkit-box-shadow:/);
  assert.match(result.text, /rgba\(10, 20, 30, 0\.502\)/);
});

test("shadow respects layer order, disabled layers, and inset", () => {
  const result = shadow(
    context("#000", {
      layers: JSON.stringify([
        layer("a", { x: -6, inset: true }),
        layer("b", { enabled: false }),
        layer("c", { color: "#fff", y: 2 }),
      ]),
    }),
  );
  assert.equal(result.text, "box-shadow: -6px 8px 20px -4px #00000080 inset, 0px 2px 20px -4px #FFFFFF;");
  assert.equal(
    shadow(context("#000", { layers: JSON.stringify([layer("a", { enabled: false })]) })).text,
    "box-shadow: none;",
  );
});

test("shadow rejects invalid numeric fields, duplicate IDs, negative blur, and unsafe text layers", () => {
  for (const layers of [
    JSON.stringify([layer("a", { blur: -1 })]),
    JSON.stringify([layer("a"), layer("a")]),
    JSON.stringify([layer("a", { color: "url(https://example.com)" })]),
    JSON.stringify([layer("a", { x: "0;" })]),
  ]) {
    assert.throws(() => shadow(context("#000", { layers })));
  }
  assert.throws(() => shadow(context("#000", { x: 0, y: 1, blur: -1, spread: 0 })));
  assert.throws(() =>
    shadow(context("#000", { x: 0, y: 1, blur: 2, spread: 0, additionalLayers: "0 0 2px #000; color:red" })),
  );
});
