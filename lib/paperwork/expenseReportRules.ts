import { calculateMileageSummary, type MileageRuleDraft, type MileageRuleTrip } from "./mileageRules.ts";
import { isCalendarDate, isNonnegativeAmount } from "./documentValidation.ts";
export interface ExpenseAmounts {
  amount?: number;
  tax?: number;
  tip?: number;
  category?: string;
  reimbursable?: boolean;
  billable?: boolean;
}

export interface ExpenseMileageAmounts {
  miles?: number;
  rate?: number;
  parking?: number;
  tolls?: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizeExpenseRows<T extends ExpenseAmounts>(
  rows: readonly T[],
): Array<T & Required<Pick<ExpenseAmounts, "amount" | "tax" | "tip">>> {
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    tax: Number(row.tax || 0),
    tip: Number(row.tip || 0),
  }));
}

export function getExpenseLineTotal(row: ExpenseAmounts): number {
  return money(Number(row.amount || 0) + Number(row.tax || 0) + Number(row.tip || 0));
}

export function calculateExpenseTotals(
  rows: readonly ExpenseAmounts[],
  mileageRows: readonly ExpenseMileageAmounts[],
  advanceReceived: number,
) {
  const normalizedRows = normalizeExpenseRows(rows);
  const baseAmount = money(normalizedRows.reduce((total, row) => total + row.amount, 0));
  const taxAmount = money(normalizedRows.reduce((total, row) => total + row.tax, 0));
  const tipAmount = money(normalizedRows.reduce((total, row) => total + row.tip, 0));
  const expenseTotal = money(normalizedRows.reduce((total, row) => total + getExpenseLineTotal(row), 0));
  const reimbursableTotal = money(
    normalizedRows.filter((row) => row.reimbursable).reduce((total, row) => total + getExpenseLineTotal(row), 0),
  );
  const billableTotal = money(
    normalizedRows.filter((row) => row.billable).reduce((total, row) => total + getExpenseLineTotal(row), 0),
  );
  const mileageTotal = money(mileageRows.reduce((total, row) => total + getExpenseMileageTotal(row), 0));
  const totalMiles = mileageRows.reduce((total, row) => total + Number(row.miles || 0), 0);
  const categoryTotals: Record<string, number> = {};
  normalizedRows.forEach((row) => {
    const category = row.category || "Other";
    categoryTotals[category] = money((categoryTotals[category] || 0) + getExpenseLineTotal(row));
  });

  return {
    baseAmount,
    taxAmount,
    tipAmount,
    expenseTotal,
    reimbursableTotal,
    billableTotal,
    mileageTotal,
    totalMiles,
    advanceReceived: money(Number(advanceReceived || 0)),
    reportTotal: money(expenseTotal + mileageTotal),
    amountDue: money(reimbursableTotal + mileageTotal - Number(advanceReceived || 0)),
    categoryTotals,
  };
}

export function getExpenseMileageTotal(row: ExpenseMileageAmounts): number {
  return money(
    money(Number(row.miles || 0) * Number(row.rate || 0)) + Number(row.parking || 0) + Number(row.tolls || 0),
  );
}

export function mergeExpenseMileageRows<T extends ExpenseMileageAmounts & { id: string; amount?: number }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const rows = new Map(existing.map((row) => [row.id, row]));
  incoming.forEach((row) => rows.set(row.id, { ...row, amount: getExpenseMileageTotal(row) }));
  return [...rows.values()];
}

export function validateExpenseReportData(data: {
  reportNumber: string;
  reportDate: string;
  startDate: string;
  endDate: string;
  submitter: { name: string };
  expenses: readonly (ExpenseAmounts & { date: string; merchant: string; description: string })[];
  mileageRows: readonly (ExpenseMileageAmounts & {
    date: string;
    purpose: string;
    startLocation: string;
    destination: string;
  })[];
  advanceReceived: number;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.submitter.name.trim()) errors["submitter.name"] = "Enter the submitter name.";
  if (!data.reportNumber.trim()) errors.reportNumber = "Enter a report number.";
  for (const field of ["reportDate", "startDate", "endDate"] as const)
    if (!isCalendarDate(data[field])) errors[field] = "Choose a valid calendar date.";
  if (data.endDate < data.startDate) errors.endDate = "Report end date must be on or after its start date.";
  if (!isNonnegativeAmount(data.advanceReceived))
    errors.advanceReceived = "Advance must be a finite amount of 0 or greater.";
  if (!data.expenses.length && !data.mileageRows.length) errors.expenses = "Add an expense or a mileage entry.";
  const validateDate = (date: string, path: string) => {
    if (!isCalendarDate(date) || date < data.startDate || date > data.endDate)
      errors[path] = "Choose a valid date within the report period.";
  };
  data.expenses.forEach((row, index) => {
    validateDate(row.date, `expenses[${index}].date`);
    for (const field of ["merchant", "description"] as const)
      if (!row[field].trim()) errors[`expenses[${index}].${field}`] = "Complete the expense details.";
    for (const field of ["amount", "tax", "tip"] as const)
      if (!isNonnegativeAmount(row[field] ?? 0))
        errors[`expenses[${index}].${field}`] = "Enter a finite amount of 0 or greater.";
  });
  data.mileageRows.forEach((row, index) => {
    validateDate(row.date, `mileageRows[${index}].date`);
    for (const field of ["purpose", "startLocation", "destination"] as const)
      if (!row[field].trim()) errors[`mileageRows[${index}].${field}`] = "Complete the trip details.";
    for (const field of ["miles", "rate", "parking", "tolls"] as const)
      if (!isNonnegativeAmount(row[field] ?? 0))
        errors[`mileageRows[${index}].${field}`] = "Enter a finite amount of 0 or greater.";
  });
  const totals = calculateExpenseTotals(data.expenses, data.mileageRows, data.advanceReceived);
  if (!Number.isFinite(totals.reportTotal) || totals.reportTotal > Number.MAX_SAFE_INTEGER / 100)
    errors.expenses = "Report amount is too large to calculate accurately.";
  return errors;
}

export function importExpenseMileageRows<
  T extends ExpenseMileageAmounts & {
    id: string;
    amount?: number;
    date: string;
    purpose: string;
    startLocation: string;
    destination: string;
  },
>(
  existing: readonly T[],
  draft: MileageRuleDraft & { trips: Array<MileageRuleTrip & T> },
): { rows: T[]; errors: string[] } {
  const summary = calculateMileageSummary(draft);
  const errors = [...summary.errors];
  if (
    draft.trips.some(
      (trip) =>
        !String(trip.purpose ?? "").trim() ||
        !String(trip.startLocation ?? "").trim() ||
        !String(trip.destination ?? "").trim(),
    )
  )
    errors.push("Complete each trip's purpose, start and destination before importing.");
  const incoming = summary.trips.map((row, index) => ({ ...draft.trips[index], ...row }));
  return { rows: errors.length ? [...existing] : mergeExpenseMileageRows(existing, incoming), errors };
}
