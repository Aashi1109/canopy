import assert from "node:assert/strict";
import test from "node:test";
import { cropPlan } from "../tools/crop-pdf/plan.ts";
import { onPagesInspected, onSettingsChanged, validate } from "../tools/crop-pdf/hooks.ts";

const pages = [
  { pageNumber: 1, pageWidth: 595, pageHeight: 842 },
  { pageNumber: 2, pageWidth: 400, pageHeight: 600 },
];
test("crop values must be whole-number points, including on fractional PDF pages", () => {
  const fractionalPages = [{ pageNumber: 1, pageWidth: 595.2756, pageHeight: 841.8898 }];
  const whole = { pages: "all", cropX: 0, cropY: 0, cropWidth: 595, cropHeight: 841 };
  assert.deepEqual(cropPlan(whole, fractionalPages).box, { x: 0, y: 0, width: 595, height: 841 });
  for (const key of ["cropX", "cropY", "cropWidth", "cropHeight"]) {
    for (const value of [1.5, "1.5"])
      assert.throws(() => cropPlan({ ...whole, [key]: value }, fractionalPages), /whole-number/);
  }
});

test("inspection and page selection keep crop defaults within fractional page bounds", () => {
  const previews = [{ pageNumber: 1, pageWidth: 595.2756, pageHeight: 841.8898 }];
  assert.deepEqual(onPagesInspected(previews), { pages: "all", cropWidth: 595, cropHeight: 841 });
  const box = { pages: "all", cropX: 10, cropY: 10, cropWidth: 595, cropHeight: 841 };
  assert.deepEqual(onSettingsChanged(box, previews), { cropWidth: 585, cropHeight: 831 });
  assert.match(validate({ ...box, cropX: 0.5 }), /whole-number/);
  assert.equal(validate(box), null);
});

const settings = { pages: "all", cropX: 36, cropY: 36, cropWidth: 328, cropHeight: 528 };
test("crop plan validates the exact selected page geometry", () => {
  assert.deepEqual(cropPlan(settings, pages).selected, [1, 2]);
  assert.deepEqual(cropPlan({ ...settings, pages: "1", cropWidth: 523 }, pages).selected, [1]);
  assert.deepEqual(cropPlan({ ...settings, pages: "even" }, pages).selected, [2]);
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
    assert.throws(() => cropPlan({ ...settings, ...update }, pages));
  }
});
