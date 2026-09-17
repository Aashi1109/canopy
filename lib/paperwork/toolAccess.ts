import { getAvailableToolBySlug } from "@canopy/control-plane";

import { getToolManifest } from "../tool-framework/manifest";

const STORAGE_TOOL_SLUGS: Readonly<Record<string, string>> = {
  paperwork_kit_invoice_draft: "invoice-generator",
  "paperworkkit.invoice.summary": "invoice-generator",
  "paperworkkit.receipt.draft": "receipt-generator",
  "paperworkkit.receipt.summary": "receipt-generator",
  "paperworkkit.expenseReport.draft": "expense-report",
  "paperworkkit.expenseReport.summary": "expense-report",
  "paperworkkit.mileageLog.draft": "mileage-log",
  "paperworkkit.mileageLog.summary": "mileage-log",
  "paperworkkit.taxEstimator.draft": "quarterly-tax-estimator",
  "paperworkkit.taxEstimator.summary": "quarterly-tax-estimator",
  "paperworkkit.1099Tracker.draft": "1099-nec-tracker",
  "paperworkkit.1099Tracker.summary": "1099-nec-tracker",
};

export class PaperworkToolAccessError extends Error {
  constructor(readonly status: 400 | 404) {
    super(status === 400 ? "Invalid tool data." : "Tool not found.");
  }
}

export async function requireAvailablePaperworkTool(slug: string): Promise<void> {
  if (!(await getAvailableToolBySlug("paperwork", slug, await getToolManifest()))) {
    throw new PaperworkToolAccessError(404);
  }
}

export async function requireAvailableToolForStorageKey(key: string): Promise<void> {
  const slug = STORAGE_TOOL_SLUGS[key];
  if (!slug) throw new PaperworkToolAccessError(400);
  await requireAvailablePaperworkTool(slug);
}

export async function requireAnyAvailablePaperworkTool(slugs: readonly string[]): Promise<void> {
  const manifest = await getToolManifest();
  const tools = await Promise.all(slugs.map((slug) => getAvailableToolBySlug("paperwork", slug, manifest)));
  if (!tools.some(Boolean)) throw new PaperworkToolAccessError(404);
}

export function getAnonymousUserId(value: string | null): string {
  if (value === null) return "default_user";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new PaperworkToolAccessError(400);
  }
  return value;
}
