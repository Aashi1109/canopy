import { test, expect } from "vitest";
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
  expect(gradient(context("#2563eb", { type: "linear", angle: 135 }, "#7c3aed")).text).toBe(
    "background: linear-gradient(135deg, #2563eb, #7c3aed);",
  );
  expect(gradient(context("fff", { type: "radial" }, "000")).text).toBe(
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
  expect(result.text).toBe(
    "background: #FF0000;\nbackground: radial-gradient(ellipse at 25% 75%, #FF0000 0%, #0000FF 40%, #00000000 100%);",
  );
  expect(result.downloadName).toBe("gradient.css");
});

test("gradient rejects malformed stops and CSS injection", () => {
  for (const stops of [
    "{",
    "[]",
    JSON.stringify([stop("a", "#fff; color:red", 0), stop("b", "#000", 100)]),
    JSON.stringify([stop("a", "#fff", -1), stop("b", "#000", 100)]),
  ]) {
    expect(() => gradient(context("#fff", { type: "linear", angle: 90, stops }, "#000"))).toThrow();
  }
});

test("shadow preserves legacy layers, prefixes, and linked opacity", () => {
  expect(shadow(context("000", { x: -3, y: 2, blur: 0, spread: -4, inset: true })).text).toBe(
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
  expect(result.text).toMatch(/^-webkit-box-shadow:/);
  expect(result.text).toMatch(/rgba\(10, 20, 30, 0\.502\)/);
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
  expect(result.text).toBe("box-shadow: -6px 8px 20px -4px #00000080 inset, 0px 2px 20px -4px #FFFFFF;");
  expect(shadow(context("#000", { layers: JSON.stringify([layer("a", { enabled: false })]) })).text).toBe(
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
    expect(() => shadow(context("#000", { layers }))).toThrow();
  }
  expect(() => shadow(context("#000", { x: 0, y: 1, blur: -1, spread: 0 }))).toThrow();
  expect(() =>
    shadow(context("#000", { x: 0, y: 1, blur: 2, spread: 0, additionalLayers: "0 0 2px #000; color:red" })),
  ).toThrow();
});
