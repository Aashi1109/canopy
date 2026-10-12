export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isNonnegativeAmount(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !value.trim()) return false;
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

// Paperwork currently calculates money in hundredths. Reject currencies with
// different minor units instead of silently producing incorrect amounts.
export function isSupportedCurrency(value: unknown): value is string {
  if (typeof value !== "string" || !Intl.supportedValuesOf("currency").includes(value)) return false;
  return (
    new Intl.NumberFormat("en", { style: "currency", currency: value }).resolvedOptions().maximumFractionDigits === 2
  );
}

export const validateCurrency = isSupportedCurrency;
