"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceData } from "@/lib/paperwork/types";
import { calculateInvoiceTotals, formatCurrency } from "@/lib/paperwork/utils/calculations";
import { FileText, Award, Smartphone, Globe, Landmark } from "lucide-react";

interface InvoicePreviewProps {
  data: InvoiceData;
}

export default function InvoicePreview({ data }: InvoicePreviewProps) {
  const totals = calculateInvoiceTotals(data);
  const isModern = data.template === "modern";

  // Check which optional items exist to render cleanly
  const hasBizContact = !!data.business.contactName;
  const hasBizTaxId = !!data.business.taxId;
  const hasBizEmail = !!data.business.email;
  const hasBizPhone = !!data.business.phone;
  const hasBizWeb = !!data.business.website;
  const hasBizAddr2 = !!data.business.addressLine2;

  const hasClientCompany = !!data.client.company;
  const hasClientEmail = !!data.client.email;
  const hasClientPhone = !!data.client.phone;
  const hasClientAddr2 = !!data.client.addressLine2;

  const hasPoNumber = !!data.invoice.poNumber;
  const hasProjectName = !!data.invoice.projectName;
  const hasNotes = !!data.notes.notes;
  const hasLateFeeNote = !!data.payment.lateFeeNote;

  // Render accepted payment methods as text
  const getMethodLabels = () => {
    const list: string[] = [];
    const methods = data.payment.methods || [];
    if (methods.includes("bank")) list.push("Bank Wire Transfer");
    if (methods.includes("check")) list.push("Paper Check");
    if (methods.includes("paypal")) list.push("PayPal");
    if (methods.includes("venmo")) list.push("Venmo");
    if (methods.includes("zelle")) list.push("Zelle System");
    if (methods.includes("card")) list.push("Credit/Debit Card");
    if (methods.includes("cash")) list.push("Cash Payments");
    return list.join(", ");
  };

  return (
    <div
      className="min-h-[297mm] w-full space-y-8 rounded-2xl border border-slate-200 bg-white p-6 font-sans tracking-tight text-slate-900 shadow-md select-none [content-visibility:auto] print:m-0 print:max-w-full print:border-0 print:p-0 print:shadow-none print:[print-color-adjust:exact] md:p-8"
      id="invoice-print-area"
    >
      {/* ==============================================
          TEMPLATE 1: MODERN LAYOUT (Charcoal / Off-center Accent)
          ============================================== */}
      {isModern && (
        <div className="space-y-6" id="template-modern-root">
          {/* Top colored aesthetic strip */}
          <div className="h-2 bg-slate-900 -mx-6 md:-mx-8 -mt-6 md:-mt-8 rounded-t-2xl print:hidden" />

          {/* Header Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="space-y-2">
              {data.business.logo ? (
                <div className="h-12 w-auto max-w-[180px] flex items-center mb-1">
                  <img
                    src={data.business.logo}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[10px] text-slate-600 font-bold print:hidden">
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Your Logo</span>
                </div>
              )}
              <div>
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-950 uppercase font-sans">
                  {data.business.name || "[Your Business Name]"}
                </h1>
                {hasBizContact && (
                  <p className="text-xs text-slate-500 font-medium">{data.business.contactName}</p>
                )}
                {hasBizTaxId && (
                  <p className="text-xs text-slate-500 font-mono">
                    Tax ID/EIN: {data.business.taxId}
                  </p>
                )}
              </div>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-900 tracking-wider uppercase mb-1">
                INVOICE
              </span>
              <p className="text-sm font-bold text-slate-900 font-mono">
                #{data.invoice.invoiceNumber || "INV-YYYY-001"}
              </p>
              <div className="text-xs text-slate-500">
                <p>
                  Issue Date:{" "}
                  <span className="font-semibold text-slate-800">
                    {data.invoice.invoiceDate || "N/A"}
                  </span>
                </p>
                <p>
                  Due Date:{" "}
                  <span className="font-semibold text-slate-800">
                    {data.invoice.dueDate || "N/A"}
                  </span>
                </p>
                <p>
                  Terms:{" "}
                  <span className="font-semibold text-slate-800">
                    {data.invoice.paymentTerms || "N/A"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Business and Clients billing info columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Seller details
              </span>
              <p className="font-bold text-slate-900 text-sm">
                {data.business.name || "[Your Business Name]"}
              </p>
              {data.business.addressLine1 && (
                <p className="text-xs text-slate-600">
                  {data.business.addressLine1}
                  {hasBizAddr2 && `, ${data.business.addressLine2}`}
                </p>
              )}
              {(data.business.city || data.business.state || data.business.zipCode) && (
                <p className="text-xs text-slate-600">
                  {data.business.city || ""}, {data.business.state || ""}{" "}
                  {data.business.zipCode || ""}
                </p>
              )}
              <p className="text-xs text-slate-600">{data.business.country || "United States"}</p>

              {/* Contact parameters */}
              <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                {hasBizEmail && <p>{data.business.email}</p>}
                {hasBizPhone && <p>{data.business.phone}</p>}
                {hasBizWeb && <p className="font-medium text-slate-600">{data.business.website}</p>}
              </div>
            </div>

            <div className="space-y-1 bg-slate-50/40 border border-slate-200 p-4 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Prepared For / Bill To
              </span>
              <p className="font-bold text-slate-950 text-sm">
                {data.client.name || "[Client Name Required]"}
              </p>
              {hasClientCompany && (
                <p className="text-xs font-semibold text-slate-700">{data.client.company}</p>
              )}
              {data.client.addressLine1 && (
                <p className="text-xs text-slate-600">
                  {data.client.addressLine1}
                  {hasClientAddr2 && `, ${data.client.addressLine2}`}
                </p>
              )}
              {(data.client.city || data.client.state || data.client.zipCode) && (
                <p className="text-xs text-slate-600">
                  {data.client.city || ""}, {data.client.state || ""} {data.client.zipCode || ""}
                </p>
              )}
              <p className="text-xs text-slate-600">{data.client.country || "United States"}</p>

              <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                {hasClientEmail && <p>{data.client.email}</p>}
                {hasClientPhone && <p>{data.client.phone}</p>}
              </div>
            </div>
          </div>

          {/* Project specifics banner */}
          {(hasProjectName || hasPoNumber) && (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200/50 p-3 rounded-xl text-xs">
              {hasProjectName && (
                <div>
                  <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">
                    Project
                  </span>
                  <span className="font-bold text-slate-800">{data.invoice.projectName}</span>
                </div>
              )}
              {hasPoNumber && (
                <div>
                  <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">
                    P.O. Number
                  </span>
                  <span className="font-bold text-slate-800 font-mono">
                    {data.invoice.poNumber}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==============================================
          TEMPLATE 2: CLASSIC LAYOUT (Formal, corporate-grid structure)
          ============================================== */}
      {!isModern && (
        <div className="space-y-6" id="template-classic-root">
          {/* Simple classic header grids */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b-2 border-slate-900">
            <div className="space-y-2">
              {data.business.logo ? (
                <div className="h-10 w-auto max-w-[150px] flex items-center">
                  <img
                    src={data.business.logo}
                    alt="Logo"
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}
              <div>
                <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">
                  {data.business.name || "[Your Business Name]"}
                </h1>
                <div className="text-xs text-slate-600 leading-normal space-y-0.5">
                  {hasBizContact && <p>{data.business.contactName}</p>}
                  {data.business.addressLine1 && (
                    <p>
                      {data.business.addressLine1}
                      {hasBizAddr2 && `, ${data.business.addressLine2}`}
                    </p>
                  )}
                  {(data.business.city || data.business.state || data.business.zipCode) && (
                    <p>
                      {data.business.city || ""}, {data.business.state || ""}{" "}
                      {data.business.zipCode || ""}
                    </p>
                  )}
                  <p>{data.business.country || "United States"}</p>
                  {hasBizTaxId && (
                    <p className="font-mono text-slate-500">Tax EIN: {data.business.taxId}</p>
                  )}
                  {(hasBizEmail || hasBizPhone || hasBizWeb) && (
                    <p className="text-slate-500">
                      {[data.business.email, data.business.phone, data.business.website]
                        .filter(Boolean)
                        .join("  |  ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1 shrink-0">
              <h2 className="text-3xl font-light tracking-widest text-slate-800 leading-none">
                INVOICE
              </h2>
              <div className="text-xs space-y-1 text-slate-600 pt-2">
                <p>
                  Invoice #{" "}
                  <span className="font-mono font-bold text-slate-900">
                    {data.invoice.invoiceNumber || "INV-YYYY-001"}
                  </span>
                </p>
                <p>
                  Date of Issue:{" "}
                  <span className="font-semibold text-slate-900">
                    {data.invoice.invoiceDate || "N/A"}
                  </span>
                </p>
                <p>
                  Date Due:{" "}
                  <span className="font-semibold text-slate-900">
                    {data.invoice.dueDate || "N/A"}
                  </span>
                </p>
                <p>
                  Payment Terms:{" "}
                  <span className="font-semibold text-slate-900">
                    {data.invoice.paymentTerms || "N/A"}
                  </span>
                </p>
                {hasPoNumber && (
                  <p>
                    P.O. Number:{" "}
                    <span className="font-mono font-semibold text-slate-900">
                      {data.invoice.poNumber}
                    </span>
                  </p>
                )}
                {hasProjectName && (
                  <p>
                    Project Name:{" "}
                    <span className="font-semibold text-slate-900">{data.invoice.projectName}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bill to classic row */}
          <div className="bg-slate-50/50 p-4 rounded-lg border border-slate-100 flex flex-col sm:flex-row justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Invoice Recipient (Bill To)
              </span>
              <p className="font-bold text-slate-900 text-sm">
                {data.client.name || "[Client Name Required]"}
              </p>
              {hasClientCompany && (
                <p className="text-xs font-semibold text-slate-700">{data.client.company}</p>
              )}
              {data.client.addressLine1 && (
                <p className="text-xs text-slate-600">
                  {data.client.addressLine1}
                  {hasClientAddr2 && `, ${data.client.addressLine2}`}
                </p>
              )}
              {(data.client.city || data.client.state || data.client.zipCode) && (
                <p className="text-xs text-slate-600">
                  {data.client.city || ""}, {data.client.state || ""} {data.client.zipCode || ""}
                </p>
              )}
              <p className="text-xs text-slate-500">{data.client.country || "United States"}</p>
            </div>

            <div className="text-xs text-slate-700 flex flex-col justify-end text-sm text-left sm:text-right space-y-0.5">
              {hasClientEmail && <p>Email: {data.client.email}</p>}
              {hasClientPhone && <p>Phone: {data.client.phone}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ==============================================
          COMMON SEGMENT: LINE ITEMS TABLE (Universal)
          ============================================== */}
      <div className="space-y-4" id="preview-lines-table">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-bold">
              <th className="py-2.5 font-semibold text-[10px] uppercase tracking-wider text-left">
                Item Description
              </th>
              <th className="py-2.5 font-semibold text-[10px] uppercase tracking-wider text-center w-16">
                Qty
              </th>
              <th className="py-2.5 font-semibold text-[10px] uppercase tracking-wider text-right w-24">
                Unit Price
              </th>
              <th className="py-2.5 font-semibold text-[10px] uppercase tracking-wider text-right w-24">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {data.lineItems && data.lineItems.length > 0 ? (
              data.lineItems.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                const amount = qty * price;
                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/40">
                    <td className="py-3 pr-4 max-w-sm align-top leading-relaxed">
                      <p className="font-semibold text-slate-900">
                        {item.description || "[No Description Provided]"}
                      </p>
                      {item.taxable && (
                        <span className="inline-block mt-1 font-mono text-[11px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded border border-slate-200">
                          Taxable
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-center font-mono align-top text-slate-600">{qty}</td>
                    <td className="py-3 text-right font-mono align-top text-slate-600">
                      {formatCurrency(price, "USD")}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold align-top text-slate-900">
                      {formatCurrency(amount, "USD")}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400 italic font-medium">
                  Add at least one line item in the edit pane
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==============================================
          COMMON SEGMENT: FINANCIAL SUMMARY ROW
          ============================================== */}
      <div
        className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 border-t border-slate-100"
        id="preview-financials-summary"
      >
        {/* Safe text instructions on Left column */}
        <div className="md:col-span-7 space-y-4">
          {data.payment.instructions && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" />
                <span>Payment Instructions</span>
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap max-w-md bg-slate-50 border border-slate-200/50 p-2.5 rounded-lg">
                {data.payment.instructions}
              </p>
            </div>
          )}

          {getMethodLabels() && (
            <div className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">Supported Methods:</span>{" "}
              {getMethodLabels()}
            </div>
          )}
        </div>

        {/* Calculated financial rows on Right column */}
        <div className="md:col-span-5 space-y-2 text-xs text-slate-600 font-medium">
          <div className="flex justify-between font-medium">
            <span>Subtotal:</span>
            <span className="font-mono text-slate-900 text-right">
              {formatCurrency(totals.subtotal, "USD")}
            </span>
          </div>

          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>
                Discount{" "}
                {data.totalsConfig.discountType === "percent"
                  ? `(${data.totalsConfig.discountValue}%)`
                  : ""}
                :
              </span>
              <span className="font-mono text-right">
                - {formatCurrency(totals.discountAmount, "USD")}
              </span>
            </div>
          )}

          {totals.taxAmount > 0 && (
            <div className="flex justify-between">
              <span className="truncate">
                {data.totalsConfig.taxLabel || "Sales Tax"} ({data.totalsConfig.taxRate}%):
              </span>
              <span className="font-mono text-slate-900 text-right">
                {formatCurrency(totals.taxAmount, "USD")}
              </span>
            </div>
          )}

          {totals.shippingFee > 0 && (
            <div className="flex justify-between">
              <span>Shipping &amp; Handling:</span>
              <span className="font-mono text-slate-900 text-right">
                {formatCurrency(totals.shippingFee, "USD")}
              </span>
            </div>
          )}

          <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-base text-slate-950">
            <span>Total Total:</span>
            <span className="font-mono text-right">{formatCurrency(totals.total, "USD")}</span>
          </div>

          {totals.amountPaid > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>Amount Paid (Partial):</span>
              <span className="font-mono text-right">
                - {formatCurrency(totals.amountPaid, "USD")}
              </span>
            </div>
          )}

          {/* Balance Due Pill highlighting */}
          <div className="flex justify-between items-center border-t-2 border-slate-900 pt-2 bg-slate-950 text-white rounded-lg p-3 mt-1 shadow-sm">
            <span className="font-bold text-xs">Balance Due (USD):</span>
            <span className="font-mono text-lg font-black text-right">
              {formatCurrency(totals.balanceDue, "USD")}
            </span>
          </div>
        </div>
      </div>

      {/* ==============================================
          COMMON SEGMENT: BUSINESS FOOTNOTES (Notes, Terms, Footers)
          ============================================== */}
      <div
        className="space-y-4 pt-4 border-t border-slate-100 text-[11px] leading-relaxed text-slate-500"
        id="preview-terms-block"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {hasNotes && (
            <div className="space-y-1">
              <span className="font-bold text-slate-700 block">Notes &amp; Scope:</span>
              <p className="text-slate-600 p-2 rounded-lg border border-slate-100/60 bg-slate-50/30">
                {data.notes.notes}
              </p>
            </div>
          )}
          {data.notes.terms && (
            <div className="space-y-1">
              <span className="font-bold text-slate-700 block">Terms &amp; Agreements:</span>
              <p className="text-slate-600 p-2 rounded-lg border border-slate-100/60 bg-slate-50/30">
                {data.notes.terms}
              </p>
            </div>
          )}
        </div>

        {/* Highlight late fee warnings and warm signature */}
        {(hasLateFeeNote || data.payment.thankYouNote) && (
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2 pt-2 text-xs border-t border-dashed border-slate-100 text-slate-500">
            <div>
              {hasLateFeeNote && (
                <p className="font-mono text-[10px] text-red-600 font-semibold">
                  * Note: {data.payment.lateFeeNote}
                </p>
              )}
            </div>
            <div className="sm:text-right">
              {data.payment.thankYouNote && (
                <p className="font-bold text-slate-800 italic">{data.payment.thankYouNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Visual brand footnotes */}
        <div className="pt-6 text-center text-[10px] text-slate-400 border-t border-slate-100/60 flex justify-between items-center print:hidden">
          <span>
            Printed on{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className="font-semibold tracking-wide uppercase text-slate-400">
            Powered by SmartTools Paperwork
          </span>
        </div>
      </div>
    </div>
  );
}
