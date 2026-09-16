/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceData } from "../types";

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
  NEC_DRAFT: "paperworkkit.1099Tracker.draft",
  NEC_SUMMARY: "paperworkkit.1099Tracker.summary",
};

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
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const val = localStorage.getItem(key);
      if (val) {
        return JSON.parse(val) as T;
      }
    } catch (e) {
      console.error(`Error reading key ${key} from localStorage`, e);
    }
    return fallback;
  }

  set<T>(key: string, data: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error writing key ${key} to localStorage`, e);
    }
  }

  getInvoiceDraft(): InvoiceData | null {
    return this.get<InvoiceData | null>(DataBridgeKeys.INVOICE_DRAFT, null);
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
    return this.get<VendorProfile[]>(DataBridgeKeys.W9_VENDORS, []);
  }

  saveW9Vendors(vendors: VendorProfile[]): void {
    this.set(DataBridgeKeys.W9_VENDORS, vendors);
  }
}

export class PostgresApiProvider implements IDataStoreProvider {
  private localCache = new LocalStorageProvider();
  private userId: string = "default_user";

  constructor() {
    if (typeof window !== "undefined") {
      this.userId = this.getOrCreateUserId();
      this.syncFromDb();
    }
  }

  private getOrCreateUserId(): string {
    if (typeof window === "undefined") return "default_user";
    let id = localStorage.getItem("paperwork_kit_user_id");
    if (!id) {
      id = "usr_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("paperwork_kit_user_id", id);
    }
    return id;
  }

  private async syncFromDb() {
    if (typeof window === "undefined") return;
    try {
      const vendorsRes = await fetch("/api/paperwork/vendors", {
        headers: {
          "x-user-id": this.userId,
        },
      });
      if (vendorsRes.ok) {
        const data = await vendorsRes.json();
        if (data.success && Array.isArray(data.vendors)) {
          this.localCache.saveW9Vendors(data.vendors);
        }
      }

      const keysToSync = [
        DataBridgeKeys.INVOICE_DRAFT,
        DataBridgeKeys.RECEIPT_DRAFT,
        DataBridgeKeys.MILEAGE_DRAFT,
        DataBridgeKeys.EXPENSE_DRAFT,
        DataBridgeKeys.NEC_DRAFT,
        DataBridgeKeys.INVOICE_SUMMARY,
        DataBridgeKeys.RECEIPT_SUMMARY,
        DataBridgeKeys.EXPENSE_SUMMARY,
        DataBridgeKeys.MILEAGE_SUMMARY,
        DataBridgeKeys.TAX_DRAFT,
        DataBridgeKeys.TAX_SUMMARY,
        DataBridgeKeys.NEC_SUMMARY,
      ];

      for (const key of keysToSync) {
        const storageRes = await fetch(`/api/paperwork/storage/${key}`, {
          headers: {
            "x-user-id": this.userId,
          },
        });
        if (storageRes.ok) {
          const resJson = await storageRes.json();
          if (resJson.found && resJson.value !== null) {
            this.localCache.set(key, resJson.value);
          }
        }
      }
    } catch (err) {
      console.warn("Background Database synchronization warning:", err);
    }
  }

  get<T>(key: string, fallback: T): T {
    return this.localCache.get<T>(key, fallback);
  }

  set<T>(key: string, data: T): void {
    this.localCache.set<T>(key, data);
    if (typeof window === "undefined") return;

    fetch("/api/paperwork/storage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": this.userId,
      },
      body: JSON.stringify({ key, value: data }),
    }).catch((err) => console.error(`Error saving key ${key} to backend Postgres:`, err));
  }

  getInvoiceDraft(): InvoiceData | null {
    return this.get<InvoiceData | null>(DataBridgeKeys.INVOICE_DRAFT, null);
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
    return this.get<VendorProfile[]>(DataBridgeKeys.W9_VENDORS, []);
  }

  saveW9Vendors(vendors: VendorProfile[]): void {
    this.localCache.saveW9Vendors(vendors);
    if (typeof window === "undefined") return;

    fetch("/api/paperwork/vendors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": this.userId,
      },
      body: JSON.stringify({ vendors }),
    }).catch((err) => console.error("Error bulk updating vendors to backend Postgres:", err));
  }
}

let activeProvider: IDataStoreProvider = new PostgresApiProvider();

export const DataBridge = {
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
