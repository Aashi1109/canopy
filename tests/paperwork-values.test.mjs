import { expect, test } from "vitest";
import { isCalendarDate, isNonnegativeAmount, isSupportedCurrency } from "../lib/paperwork/documentValidation.ts";
import { csvCell, localDate } from "../lib/paperwork/exportValues.ts";

test("document dates reject rollover, timestamps and impossible calendar days", () => {
  expect(isCalendarDate("2024-02-29")).toBe(true);
  for (const value of ["2026-02-29", "2026-04-31", "2026-99-99", "2026-1-01", "", null]) {
    expect(isCalendarDate(value)).toBe(false);
  }
});

test("financial inputs reject missing, nonfinite and negative amounts", () => {
  for (const value of ["", " ", null, undefined, NaN, Infinity, -1, true, {}, []]) {
    expect(isNonnegativeAmount(value)).toBe(false);
  }
  expect(isNonnegativeAmount(0)).toBe(true);
  expect(isNonnegativeAmount("2.50")).toBe(true);
});

test("currency support is limited to real currencies with two decimal minor units", () => {
  expect(isSupportedCurrency("USD")).toBe(true);
  expect(isSupportedCurrency("EUR")).toBe(true);
  for (const value of ["ZZZ", "JPY", "KWD", "usd", null]) expect(isSupportedCurrency(value)).toBe(false);
});

test("CSV cells escape quotes and neutralize spreadsheet formulas, including whitespace prefixes", () => {
  expect(csvCell('A, "B"\nC')).toBe('"A, ""B""\nC"');
  for (const value of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", " \t=1+1", "\r=1+1"]) {
    expect(csvCell(value)).toBe("\"'" + value.replaceAll('"', '""') + '"');
  }
  expect(csvCell(-2)).toBe("-2");
  expect(csvCell(Infinity)).toBe('""');
});

test("localDate uses calendar components rather than a UTC substring", () => {
  const value = new Date(2026, 9, 11, 0, 30);
  expect(localDate(value)).toBe("2026-10-11");
});
