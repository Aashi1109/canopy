import { test, expect } from "vitest";
import { run as radius } from "../tools/border-radius-generator/run.ts";
import { run as units } from "../tools/css-unit-converter/run.ts";

const context = (text, settings) => ({ input: { text, files: [] }, settings });
const corners = { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 };
const conversion = (text, settings = {}) => units(context(text, { from: "px", to: "rem", base: 16, ...settings }));

test("radius generates the shortest equivalent circular shorthand and retains legacy corner values", () => {
  expect(radius(context("", corners)).text).toBe("border-radius: 16px;");
  expect(radius(context("", { ...corners, topLeft: 48, bottomRight: 48 })).text).toBe("border-radius: 48px 16px;");
  expect(radius(context("", { ...corners, topLeft: 48, bottomRight: 8 })).text).toBe("border-radius: 48px 16px 8px;");
  expect(radius(context("", { ...corners, topLeft: 48, bottomRight: 8, bottomLeft: 4 })).text).toBe(
    "border-radius: 48px 16px 8px 4px;",
  );
});

test("radius supports percentages, decimal rem, and independent elliptical axes", () => {
  expect(
    radius(context("", { ...corners, unit: "%", topLeft: 50, topRight: 50, bottomRight: 50, bottomLeft: 50 })).text,
  ).toBe("border-radius: 50%;");
  expect(
    radius(context("", { topLeft: 1.5, topRight: 1.5, bottomRight: 1.5, bottomLeft: 1.5, unit: "rem" })).text,
  ).toBe("border-radius: 1.5rem;");
  expect(
    radius(context("", { ...corners, elliptical: true, topLeftY: 8, topRightY: 12, bottomRightY: 8, bottomLeftY: 12 }))
      .text,
  ).toBe("border-radius: 16px / 8px 12px;");
  expect(
    radius(
      context("", { ...corners, elliptical: true, topLeftY: 16, topRightY: 16, bottomRightY: 16, bottomLeftY: 16 }),
    ).text,
  ).toBe("border-radius: 16px;");
});

test("radius rejects invalid values and units at the execution boundary", () => {
  for (const topLeft of [-1, NaN, Infinity])
    expect(() => radius(context("", { ...corners, topLeft }))).toThrow(/finite|negative/i);
  expect(() => radius(context("", { ...corners, unit: "url(x)" }))).toThrow(/unit/i);
});

test("unit conversion keeps legacy base, rounding and formula behavior", () => {
  expect(conversion("32").text).toBe("2rem");
  expect(conversion("1", { base: 3, roundResults: true }).text).toBe("0.3333rem");
  expect(conversion("32", { includeFormula: true }).text).toBe("2rem\nFormula: 32px × 0.0625 ≈ 2rem");
});

test("unit conversion distinguishes root, element and parent font contexts", () => {
  expect(conversion("2rem", { to: "em", base: 20, elementFontSize: 10 }).text).toBe("4em");
  expect(conversion("2em", { to: "px", elementFontSize: 10, parentFontSize: 24, emContext: "parent" }).text).toBe(
    "48px",
  );
  expect(conversion("50%", { to: "px", percentageReference: "parent-font", parentFontSize: 24 }).text).toBe("12px");
  expect(conversion("50%", { to: "px", percentageReference: "length", percentageBase: 640 }).text).toBe("320px");
});

test("unit conversion uses viewport dimensions and allows suffixes, zero and negatives", () => {
  expect(conversion("25vw", { to: "px", viewportWidth: 1280 }).text).toBe("320px");
  expect(conversion("10vh", { to: "px", viewportHeight: 720 }).text).toBe("72px");
  expect(conversion("10vmin", { to: "px", viewportWidth: 1280, viewportHeight: 720 }).text).toBe("72px");
  expect(conversion("10vmax", { to: "px", viewportWidth: 1280, viewportHeight: 720 }).text).toBe("128px");
  expect(conversion("-1.25rem", { to: "px" }).text).toBe("-20px");
  expect(conversion("0", { to: "em" }).text).toBe("0em");
  expect(conversion("1pt", { to: "px", precision: 2 }).text).toBe("1.33px");
});

test("unit batch reports structured errors with original line numbers without discarding valid rows", () => {
  const result = conversion("16px\n\nnope\n2rem\n1e309px");
  expect(result.render).toBe("table");
  expect(result.columns).toEqual(["Line", "Input", "Result"]);
  expect(result.rows).toEqual([
    ["1", "16px", "1rem"],
    ["3", "nope", ""],
    ["4", "2rem", "2rem"],
    ["5", "1e309px", ""],
  ]);
  expect(result.issues.map(({ line }) => line)).toEqual([3, 5]);
  expect(result.verdict.level).toBe("warn");
});

test("unit conversion rejects empty, malformed, unsupported and overflowing values", () => {
  for (const value of ["", "  ", "12pxjunk", "1e309", "Infinity", "20ch"]) expect(() => conversion(value)).toThrow();
  expect(() => conversion("1e308rem", { base: 10000, to: "px" })).toThrow(/large|overflow/i);
  expect(() => conversion("2rem", { base: 0 })).toThrow(/positive/i);
  expect(() => conversion("2", { to: "ch" })).toThrow(/unit/i);
  expect(() => conversion("2", { precision: 99 })).toThrow(/precision/i);
});
