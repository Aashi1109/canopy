/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceData } from "../types";
import { validatePaperworkStorageValue } from "../storageValidation";
import { getInitialBlankInvoice } from "../utils/sampleData";

export interface BusinessProfile {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  logo?: string;
  taxId?: string;
}

export interface ClientProfile {
  name: string;
  company: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface VendorProfile {
  id: string;
  legalName: string;
  businessName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city?: string;
  state?: string;
  zipCode?: string;
  entityType: "Individual" | "LLC" | "Partnership" | "Corporation" | "Unknown";
  w9Status: "Not Requested" | "Requested" | "Received" | "Needs Review" | "Not Applicable";
  notes: string;
}

export interface PaymentItem {
  id: string;
  date: string;
  vendorId: string;
  amount: number;
  paymentMethod: "Cash" | "Check" | "ACH" | "PayPal" | "Venmo" | "Zelle" | "Card" | "Other";
  category: "Services" | "Rent" | "Legal" | "Repairs" | "Commissions" | "Other";
  description: string;
  includeIn1099: boolean;
  invoiceReference?: string;
}

export interface MileageEntry {
  id: string;
  date: string;
  purpose: string;
  startLocation: string;
  destination: string;
  startOdometer?: number;
  endOdometer?: number;
  miles: number;
  rate: number;
  amount: number;
  parking?: number;
  tolls?: number;
  sourceTripId?: string;
  roundTrip?: boolean;
  notes?: string;
}

export interface ExpenseRow {
  id: string;
  date: string;
  merchant: string;
  category: string;
  description: string;
  paymentMethod: string;
  amount: number;
  tax: number;
  tip: number;
  reimbursable: boolean;
  billable: boolean;
  receiptAttached: boolean;
  receiptName?: string;
  notes?: string;
}

export interface InvoiceSummary {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  total: number;
  balanceDue: number;
}

export interface ReceiptSummary {
  receiptNumber: string;
  customerName: string;
  paymentDate: string;
  totalPaid: number;
  paymentMethod: string;
}

export interface ExpenseReportSummary {
  reportNumber: string;
  title: string;
  dateRange: string;
  totalAmount: number;
  reimbursableAmount: number;
}

export interface MileageSummaryData {
  year: number;
  totalMiles: number;
  totalAmount: number;
}

export interface TaxEstimateSummaryData {
  year: number;
  filingStatus: string;
  estimatedTotalTax: number;
  suggestedQuarterly: number;
}

export interface ContractorPaymentSummaryData {
  year: number;
  totalPayments: number;
  contractorsCount: number;
  aboveThresholdCount: number;
}

export const DataBridgeKeys = {
  INVOICE_DRAFT: "paperwork_kit_invoice_draft",
  INVOICE_SUMMARY: "paperworkkit.invoice.summary",
  RECEIPT_DRAFT: "paperworkkit.receipt.draft",
  RECEIPT_SUMMARY: "paperworkkit.receipt.summary",
  EXPENSE_DRAFT: "paperworkkit.expenseReport.draft",
  EXPENSE_SUMMARY: "paperworkkit.expenseReport.summary",
  MILEAGE_DRAFT: "paperworkkit.mileageLog.draft",
  MILEAGE_SUMMARY: "paperworkkit.mileageLog.summary",
  TAX_DRAFT: "paperworkkit.taxEstimator.draft",
  TAX_SUMMARY: "paperworkkit.taxEstimator.summary",
  W9_VENDORS: "paperworkkit.w9Request.vendors",
  W9_DRAFT: "paperworkkit.w9Request.draft",
  NEC_DRAFT: "paperworkkit.1099Tracker.draft",
  NEC_SUMMARY: "paperworkkit.1099Tracker.summary",
};

class DraftOwnerChangedError extends Error {}

export interface IDataStoreProvider {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, data: T): void;
  getInvoiceDraft(): InvoiceData | null;
  getReceiptDraft(): any | null;
  getMileageDraft(): any | null;
  getExpenseDraft(): any | null;
  getW9Vendors(): VendorProfile[];
  saveW9Vendors(vendors: VendorProfile[]): void;
}

export class LocalStorageProvider implements IDataStoreProvider {
  protected localError: string | null = null;
  protected ownerNamespace: string | null = null;
  protected storageKey(key: string): string {
    return this.ownerNamespace ? `paperwork.local.${this.ownerNamespace}.${key}` : key;
  }
  getLocalKey(key: string): string {
    return this.storageKey(key);
  }

  protected bindOwner(owner: string): void {
    if (!/^(anon|account)_v2_[a-f0-9]{64}$/.test(owner)) return;
    if (this.ownerNamespace && !this.ownerNamespace.startsWith("pending_") && this.ownerNamespace !== owner) {
      throw new DraftOwnerChangedError("The draft owner changed. Reload before saving changes.");
    }
    // Legacy browser drafts belong to the original anonymous device session only.
    if (owner.startsWith("anon_v2_") && !localStorage.getItem("paperworkkit.legacy.owner")) {
      for (const key of Object.values(DataBridgeKeys)) {
        const raw = localStorage.getItem(key);
        if (raw !== null) localStorage.setItem(`paperwork.local.${owner}.${key}`, raw);
      }
      localStorage.setItem("paperworkkit.legacy.owner", owner);
    }
    this.ownerNamespace = owner;
  }
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const val = localStorage.getItem(this.storageKey(key));
      if (val) {
        const parsed: unknown = JSON.parse(val);
        if (
          key !== DataBridgeKeys.W9_VENDORS &&
          Object.values(DataBridgeKeys).includes(key as (typeof DataBridgeKeys)[keyof typeof DataBridgeKeys])
        ) {
          validatePaperworkStorageValue(key, parsed);
        }
        if (
          key === DataBridgeKeys.W9_VENDORS &&
          (!Array.isArray(parsed) ||
            !parsed.every(
              (vendor) =>
                vendor &&
                typeof vendor === "object" &&
                typeof vendor.id === "string" &&
                typeof vendor.legalName === "string",
            ))
        )
          return fallback;
        return parsed as T;
      }
    } catch (e) {
      console.error(`Error reading key ${key} from localStorage`, e);
    }
    return fallback;
  }

  set<T>(key: string, data: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.storageKey(key), JSON.stringify(data));
      this.localError = null;
    } catch (e) {
      this.localError = "This device could not save the draft. Keep this page open until an online save succeeds.";
      console.error(`Error writing key ${key} to localStorage`, e);
    }
  }

  getInvoiceDraft(): InvoiceData | null {
    const saved = this.get<Partial<InvoiceData> | null>(DataBridgeKeys.INVOICE_DRAFT, null);
    if (!saved) return null;
    const defaults = getInitialBlankInvoice();
    return {
      ...defaults,
      ...saved,
      business: { ...defaults.business, ...saved.business },
      client: { ...defaults.client, ...saved.client },
      invoice: { ...defaults.invoice, ...saved.invoice },
      totalsConfig: { ...defaults.totalsConfig, ...saved.totalsConfig },
      payment: { ...defaults.payment, ...saved.payment },
      notes: { ...defaults.notes, ...saved.notes },
      lineItems:
        saved.lineItems?.map((item, index) =>
          Object.assign({ id: `restored-${index}`, description: "", quantity: 1, unitPrice: 0, taxable: true }, item),
        ) ?? defaults.lineItems,
    };
  }

  getReceiptDraft(): any | null {
    return this.get<any | null>(DataBridgeKeys.RECEIPT_DRAFT, null);
  }

  getMileageDraft(): any | null {
    return this.get<any | null>(DataBridgeKeys.MILEAGE_DRAFT, null);
  }

  getExpenseDraft(): any | null {
    return this.get<any | null>(DataBridgeKeys.EXPENSE_DRAFT, null);
  }

  getW9Vendors(): VendorProfile[] {
    const text = (value: unknown): string => (typeof value === "string" ? value : "");
    return this.get<VendorProfile[]>(DataBridgeKeys.W9_VENDORS, []).map((vendor) => ({
      id: vendor.id,
      legalName: vendor.legalName,
      businessName: text(vendor.businessName),
      email: text(vendor.email),
      phone: text(vendor.phone),
      addressLine1: text(vendor.addressLine1),
      city: text(vendor.city),
      state: text(vendor.state),
      zipCode: text(vendor.zipCode),
      entityType: ["Individual", "LLC", "Partnership", "Corporation", "Unknown"].includes(vendor.entityType)
        ? vendor.entityType
        : "Unknown",
      w9Status: ["Not Requested", "Requested", "Received", "Needs Review", "Not Applicable"].includes(vendor.w9Status)
        ? vendor.w9Status
        : "Not Requested",
      notes: text(vendor.notes),
    }));
  }

  saveW9Vendors(vendors: VendorProfile[]): void {
    this.set(DataBridgeKeys.W9_VENDORS, vendors);
  }
}

export type DataBridgeStatus = { ready: boolean; pending: number; error: string | null; reloadRequired?: boolean };

export class PostgresApiProvider extends LocalStorageProvider {
  private status: DataBridgeStatus = { ready: false, pending: 0, error: null };
  private listeners = new Set<() => void>();
  private edited = new Set<string>();
  private stagedEdits = new Map<string, unknown>();
  private failed = new Map<string, { url: string; body: unknown; revision: number }>();
  private revisions = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private hydration: Promise<void>;
  private automaticSavesHeld = false;

  holdAutomaticSaves(): void {
    this.automaticSavesHeld = !this.status.ready;
  }
  beginUserEdit(): void {
    this.automaticSavesHeld = false;
  }

  constructor() {
    super();
    this.ownerNamespace = `pending_${globalThis.crypto.randomUUID()}`;
    this.hydration = typeof window === "undefined" ? Promise.resolve() : this.syncFromDb();
    if (typeof window === "undefined") this.status.ready = true;
  }
  getStatus = (): DataBridgeStatus => this.status;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  whenReady = (): Promise<void> => this.hydration;
  private update(patch: Partial<DataBridgeStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private async syncFromDb(): Promise<void> {
    try {
      // First establish one session before any concurrent or queued requests.
      const response = await fetch("/api/paperwork/vendors", {
        signal: AbortSignal.timeout(15_000),
        credentials: "same-origin",
      });
      const owner = response.headers.get("x-paperwork-owner");
      if (owner) {
        this.bindOwner(owner);
        for (const [key, value] of this.stagedEdits) super.set(key, value);
        this.stagedEdits.clear();
      }
      if (!response.ok && response.status !== 404)
        throw new Error("Saved drafts could not be loaded. Your local drafts are still available.");
      const result = response.ok ? await response.json() : {};
      if (
        result.success &&
        Array.isArray(result.vendors) &&
        result.vendors.length &&
        !this.edited.has(DataBridgeKeys.W9_VENDORS) &&
        this.get(DataBridgeKeys.W9_VENDORS, null) === null
      ) {
        super.set(
          DataBridgeKeys.W9_VENDORS,
          result.vendors.map((vendor: VendorProfile) =>
            Object.fromEntries(Object.entries(vendor).map(([field, value]) => [field, value ?? ""])),
          ),
        );
      }
      const results = await Promise.allSettled(
        Object.values(DataBridgeKeys)
          .filter((key) => key !== DataBridgeKeys.W9_VENDORS)
          .map(async (key) => {
            const response = await fetch(`/api/paperwork/storage/${encodeURIComponent(key)}`, {
              signal: AbortSignal.timeout(15_000),
              credentials: "same-origin",
            });
            const responseOwner = response.headers.get("x-paperwork-owner");
            if (responseOwner && this.ownerNamespace && responseOwner !== this.ownerNamespace)
              throw new DraftOwnerChangedError("The draft owner changed. Reload before saving changes.");
            if (response.status === 404) return;
            if (!response.ok)
              throw new Error("Some saved drafts could not be loaded. Your local drafts are still available.");
            const result = await response.json();
            if (result.found && result.value !== null && !this.edited.has(key) && this.get(key, null) === null) {
              validatePaperworkStorageValue(key, result.value);
              super.set(key, result.value);
            }
          }),
      );
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      this.update({ error: this.failed.size ? this.status.error : this.localError, reloadRequired: false });
    } catch (error) {
      this.update({
        error: error instanceof Error ? error.message : "Saved drafts could not be loaded.",
        reloadRequired: error instanceof DraftOwnerChangedError,
      });
    } finally {
      this.update({ ready: true });
    }
  }
  override set<T>(key: string, data: T): void {
    if (this.automaticSavesHeld && !this.status.ready) return;
    super.set(key, data);
    if (this.ownerNamespace?.startsWith("pending_")) this.stagedEdits.set(key, data);
    if (this.localError) this.update({ error: this.localError });
    this.edited.add(key);
    this.enqueue(key, "/api/paperwork/storage", { key, value: data });
  }
  override saveW9Vendors(vendors: VendorProfile[]): void {
    if (this.automaticSavesHeld && !this.status.ready) return;
    super.set(DataBridgeKeys.W9_VENDORS, vendors);
    if (this.ownerNamespace?.startsWith("pending_")) this.stagedEdits.set(DataBridgeKeys.W9_VENDORS, vendors);
    if (this.localError) this.update({ error: this.localError });
    this.edited.add(DataBridgeKeys.W9_VENDORS);
    this.enqueue(DataBridgeKeys.W9_VENDORS, "/api/paperwork/vendors", { vendors });
  }
  private enqueue(key: string, url: string, body: unknown): void {
    if (typeof window === "undefined") return;
    const queuedOwner = this.ownerNamespace?.startsWith("pending_") ? null : this.ownerNamespace;
    const revision = (this.revisions.get(key) ?? 0) + 1;
    this.revisions.set(key, revision);
    this.update({ pending: this.status.pending + 1 });
    this.queue = this.queue.then(async () => {
      await this.hydration;
      try {
        if (this.ownerNamespace?.startsWith("pending_"))
          throw new Error("Draft ownership could not be verified. Retry loading before saving online.");
        if (queuedOwner && queuedOwner !== this.ownerNamespace)
          throw new DraftOwnerChangedError("The draft owner changed. Reload before saving changes.");
        const response = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(this.ownerNamespace ? { "x-paperwork-owner": this.ownerNamespace } : {}),
          },
          body: JSON.stringify(body),
        });
        if (response.status === 403)
          throw new DraftOwnerChangedError("The draft owner changed. Reload before saving changes.");
        if (!response.ok)
          throw new Error(
            this.localError
              ? "The draft could not be saved on this device or online. Keep this page open and retry."
              : "Cloud save failed. Your draft remains on this device. Retry to save it online.",
          );
        const result = await response.json();
        if (result.success !== true) throw new Error("Cloud save was not confirmed. Retry to save it online.");
        if ((this.failed.get(key)?.revision ?? 0) <= revision) this.failed.delete(key);
        this.update({ error: this.failed.size ? this.status.error : this.localError, reloadRequired: false });
      } catch (error) {
        // Do not retry an older failed edit after a newer successful edit.
        this.failed.set(key, { url, body, revision });
        this.update({
          error: error instanceof Error ? error.message : "Cloud save failed. Your draft remains on this device.",
          reloadRequired: error instanceof DraftOwnerChangedError,
        });
      } finally {
        this.update({ pending: this.status.pending - 1 });
      }
    });
  }
  async retry(): Promise<void> {
    await this.queue;
    if (this.ownerNamespace?.startsWith("pending_") || (!this.failed.size && this.status.error))
      await this.syncFromDb();
    for (const [key, item] of [...this.failed]) {
      if (item.revision === this.revisions.get(key)) this.enqueue(key, item.url, item.body);
    }
    await this.queue;
  }
}

let activeProvider: IDataStoreProvider = new PostgresApiProvider();

export const DataBridge = {
  holdAutomaticSaves(): void {
    if (activeProvider instanceof PostgresApiProvider) activeProvider.holdAutomaticSaves();
  },
  beginUserEdit(): void {
    if (activeProvider instanceof PostgresApiProvider) activeProvider.beginUserEdit();
  },
  scopedLocalKey(key: string): string {
    return activeProvider instanceof LocalStorageProvider ? activeProvider.getLocalKey(key) : key;
  },
  subscribe(listener: () => void): () => void {
    return activeProvider instanceof PostgresApiProvider ? activeProvider.subscribe(listener) : () => {};
  },
  getStatus(): DataBridgeStatus {
    return activeProvider instanceof PostgresApiProvider
      ? activeProvider.getStatus()
      : { ready: true, pending: 0, error: null };
  },
  whenReady(): Promise<void> {
    return activeProvider instanceof PostgresApiProvider ? activeProvider.whenReady() : Promise.resolve();
  },
  retry(): Promise<void> {
    return activeProvider instanceof PostgresApiProvider ? activeProvider.retry() : Promise.resolve();
  },
  getProvider(): IDataStoreProvider {
    return activeProvider;
  },

  setProvider(provider: IDataStoreProvider): void {
    activeProvider = provider;
  },

  get<T>(key: string, fallback: T): T {
    return activeProvider.get<T>(key, fallback);
  },

  set<T>(key: string, data: T): void {
    activeProvider.set<T>(key, data);
  },

  getInvoiceDraft(): InvoiceData | null {
    return activeProvider.getInvoiceDraft();
  },

  getReceiptDraft(): any | null {
    return activeProvider.getReceiptDraft();
  },

  getMileageDraft(): any | null {
    return activeProvider.getMileageDraft();
  },

  getExpenseDraft(): any | null {
    return activeProvider.getExpenseDraft();
  },

  getW9Vendors(): VendorProfile[] {
    return activeProvider.getW9Vendors();
  },

  saveW9Vendors(vendors: VendorProfile[]): void {
    activeProvider.saveW9Vendors(vendors);
  },
};
