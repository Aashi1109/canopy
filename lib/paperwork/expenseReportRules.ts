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
  const expenseTotal = money(
    normalizedRows.reduce((total, row) => total + getExpenseLineTotal(row), 0),
  );
  const reimbursableTotal = money(
    normalizedRows
      .filter((row) => row.reimbursable)
      .reduce((total, row) => total + getExpenseLineTotal(row), 0),
  );
  const billableTotal = money(
    normalizedRows
      .filter((row) => row.billable)
      .reduce((total, row) => total + getExpenseLineTotal(row), 0),
  );
  const mileageTotal = money(
    mileageRows.reduce((total, row) => total + Number(row.miles || 0) * Number(row.rate || 0), 0),
  );
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
