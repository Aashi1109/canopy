import assert from "node:assert/strict";
import test from "node:test";

import { run as radius } from "../tools/border-radius-generator/run.ts";
import { run as units } from "../tools/css-unit-converter/run.ts";

const context = (text, settings) => ({ input: { text, files: [] }, settings });
const corners = { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 };
const conversion = (text, settings = {}) => units(context(text, { from: "px", to: "rem", base: 16, ...settings }));

test("radius generates the shortest equivalent circular shorthand and retains legacy corner values", () => {
  assert.equal(radius(context("", corners)).text, "border-radius: 16px;");
  assert.equal(radius(context("", { ...corners, topLeft: 48, bottomRight: 48 })).text, "border-radius: 48px 16px;");
  assert.equal(radius(context("", { ...corners, topLeft: 48, bottomRight: 8 })).text, "border-radius: 48px 16px 8px;");
  assert.equal(
    radius(context("", { ...corners, topLeft: 48, bottomRight: 8, bottomLeft: 4 })).text,
    "border-radius: 48px 16px 8px 4px;",
  );
});

test("radius supports percentages, decimal rem, and independent elliptical axes", () => {
  assert.equal(
    radius(context("", { ...corners, unit: "%", topLeft: 50, topRight: 50, bottomRight: 50, bottomLeft: 50 })).text,
    "border-radius: 50%;",
  );
  assert.equal(
    radius(context("", { topLeft: 1.5, topRight: 1.5, bottomRight: 1.5, bottomLeft: 1.5, unit: "rem" })).text,
    "border-radius: 1.5rem;",
  );
  assert.equal(
    radius(context("", { ...corners, elliptical: true, topLeftY: 8, topRightY: 12, bottomRightY: 8, bottomLeftY: 12 }))
      .text,
    "border-radius: 16px / 8px 12px;",
  );
  assert.equal(
    radius(
      context("", { ...corners, elliptical: true, topLeftY: 16, topRightY: 16, bottomRightY: 16, bottomLeftY: 16 }),
    ).text,
    "border-radius: 16px;",
  );
});

test("radius rejects invalid values and units at the execution boundary", () => {
  for (const topLeft of [-1, NaN, Infinity])
    assert.throws(() => radius(context("", { ...corners, topLeft })), /finite|negative/i);
  assert.throws(() => radius(context("", { ...corners, unit: "url(x)" })), /unit/i);
});

test("unit conversion keeps legacy base, rounding and formula behavior", () => {
  assert.equal(conversion("32").text, "2rem");
  assert.equal(conversion("1", { base: 3, roundResults: true }).text, "0.3333rem");
  assert.equal(conversion("32", { includeFormula: true }).text, "2rem\nFormula: 32px × 0.0625 ≈ 2rem");
});

test("unit conversion distinguishes root, element and parent font contexts", () => {
  assert.equal(conversion("2rem", { to: "em", base: 20, elementFontSize: 10 }).text, "4em");
  assert.equal(
    conversion("2em", { to: "px", elementFontSize: 10, parentFontSize: 24, emContext: "parent" }).text,
    "48px",
  );
  assert.equal(conversion("50%", { to: "px", percentageReference: "parent-font", parentFontSize: 24 }).text, "12px");
  assert.equal(conversion("50%", { to: "px", percentageReference: "length", percentageBase: 640 }).text, "320px");
});

test("unit conversion uses viewport dimensions and allows suffixes, zero and negatives", () => {
  assert.equal(conversion("25vw", { to: "px", viewportWidth: 1280 }).text, "320px");
  assert.equal(conversion("10vh", { to: "px", viewportHeight: 720 }).text, "72px");
  assert.equal(conversion("10vmin", { to: "px", viewportWidth: 1280, viewportHeight: 720 }).text, "72px");
  assert.equal(conversion("10vmax", { to: "px", viewportWidth: 1280, viewportHeight: 720 }).text, "128px");
  assert.equal(conversion("-1.25rem", { to: "px" }).text, "-20px");
  assert.equal(conversion("0", { to: "em" }).text, "0em");
  assert.equal(conversion("1pt", { to: "px", precision: 2 }).text, "1.33px");
});

test("unit batch reports structured errors with original line numbers without discarding valid rows", () => {
  const result = conversion("16px\n\nnope\n2rem\n1e309px");
  assert.equal(result.render, "table");
  assert.deepEqual(result.columns, ["Line", "Input", "Result"]);
  assert.deepEqual(result.rows, [
    ["1", "16px", "1rem"],
    ["3", "nope", ""],
    ["4", "2rem", "2rem"],
    ["5", "1e309px", ""],
  ]);
  assert.deepEqual(
    result.issues.map(({ line }) => line),
    [3, 5],
  );
  assert.equal(result.verdict.level, "warn");
});

test("unit conversion rejects empty, malformed, unsupported and overflowing values", () => {
  for (const value of ["", "  ", "12pxjunk", "1e309", "Infinity", "20ch"]) assert.throws(() => conversion(value));
  assert.throws(() => conversion("1e308rem", { base: 10000, to: "px" }), /large|overflow/i);
  assert.throws(() => conversion("2rem", { base: 0 }), /positive/i);
  assert.throws(() => conversion("2", { to: "ch" }), /unit/i);
  assert.throws(() => conversion("2", { precision: 99 }), /precision/i);
});
