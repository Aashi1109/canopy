import { test, expect } from "vitest";
import { cropPlan } from "../tools/crop-pdf/plan.ts";
import { onPagesInspected, onSettingsChanged, validate } from "../tools/crop-pdf/hooks.ts";

const pages = [
  { pageNumber: 1, pageWidth: 595, pageHeight: 842 },
  { pageNumber: 2, pageWidth: 400, pageHeight: 600 },
];
test("crop values must be whole-number points, including on fractional PDF pages", () => {
  const fractionalPages = [{ pageNumber: 1, pageWidth: 595.2756, pageHeight: 841.8898 }];
  const whole = { pages: "all", cropX: 0, cropY: 0, cropWidth: 595, cropHeight: 841 };
  expect(cropPlan(whole, fractionalPages).box).toEqual({ x: 0, y: 0, width: 595, height: 841 });
  for (const key of ["cropX", "cropY", "cropWidth", "cropHeight"]) {
    for (const value of [1.5, "1.5"])
      expect(() => cropPlan({ ...whole, [key]: value }, fractionalPages)).toThrow(/whole-number/);
  }
});

test("inspection and page selection keep crop defaults within fractional page bounds", () => {
  const previews = [{ pageNumber: 1, pageWidth: 595.2756, pageHeight: 841.8898 }];
  expect(onPagesInspected(previews)).toEqual({ pages: "all", cropWidth: 595, cropHeight: 841 });
  const box = { pages: "all", cropX: 10, cropY: 10, cropWidth: 595, cropHeight: 841 };
  expect(onSettingsChanged(box, previews)).toEqual({ cropWidth: 585, cropHeight: 831 });
  expect(validate({ ...box, cropX: 0.5 })).toMatch(/whole-number/);
  expect(validate(box)).toBe(null);
});

const settings = { pages: "all", cropX: 36, cropY: 36, cropWidth: 328, cropHeight: 528 };
test("crop plan validates the exact selected page geometry", () => {
  expect(cropPlan(settings, pages).selected).toEqual([1, 2]);
  expect(cropPlan({ ...settings, pages: "1", cropWidth: 523 }, pages).selected).toEqual([1]);
  expect(cropPlan({ ...settings, pages: "even" }, pages).selected).toEqual([2]);
  for (const update of [
    { cropWidth: 0 },
    { cropHeight: -1 },
    { cropX: Infinity },
    { cropY: -1 },
    { cropX: 401 },
    { cropWidth: 500 },
    { pages: "3" },
    { pages: "" },
    { cropWidth: "x" },
  ]) {
    expect(() => cropPlan({ ...settings, ...update }, pages)).toThrow();
  }
});
