import { test, expect } from "vitest";
import { cropEditorPlan, cropPlan } from "../tools/crop-pdf/plan.ts";
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
  expect(validate({ ...box, cropX: 0.5 }).message).toMatch(/whole-number/);
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

test("the crop editor uses the common bounds of exactly the selected pages", () => {
  expect(cropEditorPlan(settings, pages)).toEqual({
    selected: [1, 2],
    bounds: { width: 400, height: 600 },
    box: { x: 36, y: 36, width: 328, height: 528 },
  });
  expect(cropEditorPlan({ ...settings, pages: "1" }, pages).bounds).toEqual({ width: 595, height: 842 });
  expect(cropEditorPlan({ ...settings, pages: "even" }, pages).bounds).toEqual({ width: 400, height: 600 });
  expect(
    cropEditorPlan(settings, [
      { pageNumber: 1, pageWidth: 595.2756, pageHeight: 841.8898 },
      { pageNumber: 2, pageWidth: 400.75, pageHeight: 600.25 },
    ]).bounds,
  ).toEqual({ width: 400, height: 600 });
  expect(
    cropEditorPlan(settings, [
      { pageNumber: 1, pageWidth: 600, pageHeight: 400 },
      { pageNumber: 2, pageWidth: 400, pageHeight: 600 },
    ]).bounds,
  ).toEqual({ width: 400, height: 400 });
});

test("out-of-bounds crop positions remain editable without weakening export validation", () => {
  const outside = { ...settings, cropX: 999, cropY: 999, cropWidth: 100, cropHeight: 100 };
  expect(() => cropPlan(outside, pages)).toThrow(/beyond page/);
  const { box } = cropEditorPlan(outside, pages);
  expect(box).toEqual({ x: 300, y: 500, width: 100, height: 100 });
  expect(cropPlan({ ...outside, cropX: box.x, cropY: box.y }, pages).box).toEqual(box);
});

test("oversized crop dimensions recover to a whole-number box fitting every selected page", () => {
  const outside = { ...settings, cropWidth: 1000, cropHeight: 1000 };
  expect(() => cropPlan(outside, pages)).toThrow(/beyond page/);
  const { box } = cropEditorPlan(outside, pages);
  expect(box).toEqual({ x: 0, y: 0, width: 400, height: 600 });
  expect(
    cropPlan({ ...outside, cropX: box.x, cropY: box.y, cropWidth: box.width, cropHeight: box.height }, pages).box,
  ).toEqual(box);
});

test("the crop editor still rejects malformed values and invalid page selections", () => {
  for (const update of [
    { cropX: -1 },
    { cropY: Infinity },
    { cropWidth: 0 },
    { cropHeight: -1 },
    { cropWidth: 1.5 },
    { cropX: "" },
    { pages: "" },
    { pages: "3" },
  ]) {
    expect(() => cropEditorPlan({ ...settings, ...update }, pages)).toThrow();
  }
});
