"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Building,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  PlusCircle,
  Upload,
  Plus,
  Trash2,
  Copy,
  User,
} from "lucide-react";
import {
  Caption,
  Overline,
  Muted,
  Text,
  AlertBanner,
  Button,
  CheckboxControl,
  Field,
  Input,
  Label,
  SectionCard,
  CardHeader,
  CardAction,
  H3,
  Select,
  Textarea,
} from "@canopy/ui";
import { InvoiceData, InvoiceLineItem } from "@/lib/paperwork/types";

interface InvoiceFormProps {
  data: InvoiceData;
  onChange: (newData: InvoiceData) => void;
  errors: Record<string, string>;
}

export default function InvoiceForm({ data, onChange, errors }: InvoiceFormProps) {
  const [showOptionalBiz, setShowOptionalBiz] = useState(false);
  const [showOptionalClient, setShowOptionalClient] = useState(false);

  // Auto-expand optional sections if they contain validation errors on submit
  React.useEffect(() => {
    const hasBizOptionalErrors = Object.keys(errors).some((k) => k.startsWith("business.") && k !== "business.name");
    if (hasBizOptionalErrors) {
      setShowOptionalBiz(true);
    }
  }, [errors]);

  React.useEffect(() => {
    const hasClientOptionalErrors = Object.keys(errors).some((k) => k.startsWith("client.") && k !== "client.name");
    if (hasClientOptionalErrors) {
      setShowOptionalClient(true);
    }
  }, [errors]);

  // Deep update helpers
  const updateBusiness = (fields: Partial<typeof data.business>) => {
    onChange({
      ...data,
      business: { ...data.business, ...fields },
    });
  };

  const updateClient = (fields: Partial<typeof data.client>) => {
    onChange({
      ...data,
      client: { ...data.client, ...fields },
    });
  };

  const updateInvoiceMeta = (fields: Partial<typeof data.invoice>) => {
    const updatedMeta = { ...data.invoice, ...fields };

    // Automatically update due date when terms or date is changed
    if (fields.paymentTerms || fields.invoiceDate) {
      const terms = fields.paymentTerms !== undefined ? fields.paymentTerms : data.invoice.paymentTerms;
      const baseDateStr = fields.invoiceDate !== undefined ? fields.invoiceDate : data.invoice.invoiceDate;

      if (terms !== "Custom" && baseDateStr) {
        let daysOffset = 0;
        if (terms === "Net 7") daysOffset = 7;
        else if (terms === "Net 15") daysOffset = 15;
        else if (terms === "Net 30") daysOffset = 30;
        else if (terms === "Net 45") daysOffset = 45;

        try {
          const date = new Date(baseDateStr + "T00:00:00");
          if (!isNaN(date.getTime())) {
            date.setDate(date.getDate() + daysOffset);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            updatedMeta.dueDate = `${year}-${month}-${day}`;
          }
        } catch (e) {
          // Fallback if parsing fails
        }
      }
    }

    onChange({
      ...data,
      invoice: updatedMeta,
    });
  };

  const updateTotalsConfig = (fields: Partial<typeof data.totalsConfig>) => {
    onChange({
      ...data,
      totalsConfig: { ...data.totalsConfig, ...fields },
    });
  };

  const updatePaymentInfo = (fields: Partial<typeof data.payment>) => {
    onChange({
      ...data,
      payment: { ...data.payment, ...fields },
    });
  };

  const updateNotesTerms = (fields: Partial<typeof data.notes>) => {
    onChange({
      ...data,
      notes: { ...data.notes, ...fields },
    });
  };

  // Logo operations
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      alert("Please upload a logo image smaller than 1.5MB to ensure safe offline browser state storage.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      updateBusiness({ logo: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    updateBusiness({ logo: "" });
  };

  // Line item operations
  const handleLineItemChange = (id: string, field: keyof InvoiceLineItem, value: any) => {
    const updatedItems = data.lineItems.map((item) => {
      if (item.id === id) {
        if (field === "quantity" || field === "unitPrice") {
          return { ...item, [field]: value === "" ? "" : Number(value) };
        }
        return { ...item, [field]: value };
      }
      return item;
    });
    onChange({ ...data, lineItems: updatedItems });
  };

  const addLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      description: "",
      quantity: 1,
      unitPrice: 0,
      taxable: true,
    };
    onChange({
      ...data,
      lineItems: [...data.lineItems, newItem],
    });
  };

  const duplicateLineItem = (item: InvoiceLineItem) => {
    const newItem: InvoiceLineItem = {
      ...item,
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      description: item.description ? `${item.description} (Copy)` : "",
    };
    onChange({
      ...data,
      lineItems: [...data.lineItems, newItem],
    });
  };

  const removeLineItem = (id: string) => {
    if (data.lineItems.length <= 1) {
      // Keep at least one empty line item
      const freshItem: InvoiceLineItem = {
        id: "default-item-1",
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxable: true,
      };
      onChange({ ...data, lineItems: [freshItem] });
      return;
    }
    onChange({
      ...data,
      lineItems: data.lineItems.filter((it) => it.id !== id),
    });
  };

  // Payment method trigger checkboxes
  const handleMethodCheckbox = (methodId: string) => {
    const current = data.payment.methods || [];
    const isChecked = current.includes(methodId);
    let updated: string[];
    if (isChecked) {
      updated = current.filter((m) => m !== methodId);
    } else {
      updated = [...current, methodId];
    }
    updatePaymentInfo({ methods: updated });
  };

  // Quick insert chips for terms & conditions
  const quickNotes = [
    "Thank you for your business.",
    "Please include the invoice number with your payment.",
    "Late payments may be subject to a 1.5% structural monthly interest fee.",
    "This invoice is representing consulting services rendered.",
  ];

  const handleInsertNote = (text: string) => {
    const orig = data.notes.notes ? data.notes.notes.trim() : "";
    const delimiter = orig ? " " : "";
    updateNotesTerms({ notes: `${orig}${delimiter}${text}` });
  };

  return (
    <div className="space-y-8" id="invoice-editor-form">
      {/* 1. SELLER BUSINESS BLOCK */}
      <SectionCard id="biz-editor-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <Building aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Your Business (Seller)
          </H3>
        </CardHeader>

        <div className="space-y-4">
          {/* Logo uploader row */}
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row">
            {data.business.logo ? (
              <div className="group relative flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                <img
                  src={data.business.logo}
                  alt="Business Logo Preview"
                  className="max-h-full max-w-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <Button
                  type="button"
                  onClick={removeLogo}
                  className="absolute inset-0 h-full w-full rounded-none bg-destructive/90 text-destructive-foreground opacity-0 transition-opacity hover:bg-destructive/90 group-hover:opacity-100 focus-visible:opacity-100"
                  variant="destructive"
                >
                  Delete Logo
                </Button>
              </div>
            ) : (
              <Label className="group flex h-16 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-background transition-colors hover:border-primary">
                <Upload aria-hidden="true" className="size-5 text-muted-foreground group-hover:text-primary" />
                <Caption className="mt-1 text-muted-foreground">Add Logo</Caption>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </Label>
            )}
            <div className="space-y-1 text-center sm:text-left">
              <Caption className="text-foreground">Company Logo Accent</Caption>
              <Muted className="max-w-sm text-muted-foreground">
                Optional. Recommended: horizontal layout (.png, .jpg), max file size 1.5MB. Renders client-side for
                absolute security.
              </Muted>
            </div>
          </div>

          {/* Business details inputs */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              className="md:col-span-2"
              error={errors["business.name"]}
              htmlFor="biz-name"
              label="Business Name"
              required
            >
              <Input
                aria-invalid={Boolean(errors["business.name"])}
                id="biz-name"
                type="text"
                placeholder="e.g. Blue Ridge Web Studio"
                value={data.business.name || ""}
                onChange={(e) => updateBusiness({ name: e.target.value })}
              />
            </Field>

            {/* Address fields */}
            <Field className="md:col-span-2" htmlFor="biz-addr-1" label="Address Line 1">
              <Input
                id="biz-addr-1"
                type="text"
                placeholder="42 Wall St"
                value={data.business.addressLine1 || ""}
                onChange={(e) => updateBusiness({ addressLine1: e.target.value })}
              />
            </Field>

            <Field htmlFor="biz-city" label="City">
              <Input
                id="biz-city"
                type="text"
                placeholder="Asheville"
                value={data.business.city || ""}
                onChange={(e) => updateBusiness({ city: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field htmlFor="biz-state" label="State">
                <Input
                  id="biz-state"
                  type="text"
                  placeholder="NC"
                  value={data.business.state || ""}
                  onChange={(e) => updateBusiness({ state: e.target.value })}
                />
              </Field>
              <Field htmlFor="biz-zip" label="ZIP Code">
                <Input
                  id="biz-zip"
                  type="text"
                  placeholder="28801"
                  value={data.business.zipCode || ""}
                  onChange={(e) => updateBusiness({ zipCode: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* Optional fields disclose button */}
          <div>
            <Button
              type="button"
              className="px-0"
              onClick={() => setShowOptionalBiz(!showOptionalBiz)}
              size="sm"
              variant="ghost"
            >
              <span>{showOptionalBiz ? "Hide" : "Show"} optional business fields</span>
              <Caption className="rounded-sm border border-border bg-muted px-1.5 text-muted-foreground">
                {showOptionalBiz ? "-" : "+"}
              </Caption>
            </Button>

            {showOptionalBiz && (
              <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-2">
                <Field htmlFor="biz-contact" label="Contact Name">
                  <Input
                    id="biz-contact"
                    type="text"
                    placeholder="Sarah Jenkins"
                    value={data.business.contactName || ""}
                    onChange={(e) => updateBusiness({ contactName: e.target.value })}
                  />
                </Field>

                <Field htmlFor="biz-taxid" label="Tax ID / EIN">
                  <Input
                    id="biz-taxid"
                    type="text"
                    placeholder="Employer Identification Number"
                    value={data.business.taxId || ""}
                    onChange={(e) => updateBusiness({ taxId: e.target.value })}
                  />
                </Field>

                <Field error={errors["business.email"]} htmlFor="biz-email" label="Email Address">
                  <Input
                    aria-invalid={Boolean(errors["business.email"])}
                    id="biz-email"
                    type="email"
                    placeholder="sarah@blueridgeweb.com"
                    value={data.business.email || ""}
                    onChange={(e) => updateBusiness({ email: e.target.value })}
                  />
                </Field>

                <Field htmlFor="biz-phone" label="Phone Number">
                  <Input
                    id="biz-phone"
                    type="text"
                    placeholder="(828) 555-0192"
                    value={data.business.phone || ""}
                    onChange={(e) => updateBusiness({ phone: e.target.value })}
                  />
                </Field>

                <Field className="md:col-span-2" htmlFor="biz-web" label="Website URL">
                  <Input
                    id="biz-web"
                    type="text"
                    placeholder="blueridgeweb.com"
                    value={data.business.website || ""}
                    onChange={(e) => updateBusiness({ website: e.target.value })}
                  />
                </Field>

                <Field className="md:col-span-2" htmlFor="biz-addr-2" label="Address Line 2 (Suite, Floor etc.)">
                  <Input
                    id="biz-addr-2"
                    type="text"
                    placeholder="Suite 400"
                    value={data.business.addressLine2 || ""}
                    onChange={(e) => updateBusiness({ addressLine2: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 2. BILL TO CLIENT BLOCK */}
      <SectionCard id="client-editor-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <User aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Bill To (Client)
          </H3>
        </CardHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              className="md:col-span-2"
              error={errors["client.name"]}
              htmlFor="client-name"
              label="Client Name / Company"
              required
            >
              <Input
                aria-invalid={Boolean(errors["client.name"])}
                id="client-name"
                type="text"
                placeholder="e.g. Acme Home Services or John Smith"
                value={data.client.name || ""}
                onChange={(e) => updateClient({ name: e.target.value })}
              />
            </Field>

            {/* Address fields */}
            <Field className="md:col-span-2" htmlFor="client-addr-1" label="Client Address Line 1">
              <Input
                id="client-addr-1"
                type="text"
                placeholder="100 Pine Street"
                value={data.client.addressLine1 || ""}
                onChange={(e) => updateClient({ addressLine1: e.target.value })}
              />
            </Field>

            <Field htmlFor="client-city" label="City">
              <Input
                id="client-city"
                type="text"
                placeholder="San Francisco"
                value={data.client.city || ""}
                onChange={(e) => updateClient({ city: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field htmlFor="client-state" label="State">
                <Input
                  id="client-state"
                  type="text"
                  placeholder="CA"
                  value={data.client.state || ""}
                  onChange={(e) => updateClient({ state: e.target.value })}
                />
              </Field>
              <Field htmlFor="client-zip" label="ZIP Code">
                <Input
                  id="client-zip"
                  type="text"
                  placeholder="94111"
                  value={data.client.zipCode || ""}
                  onChange={(e) => updateClient({ zipCode: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {/* Optional client fields disclose */}
          <div>
            <Button
              type="button"
              className="px-0"
              onClick={() => setShowOptionalClient(!showOptionalClient)}
              size="sm"
              variant="ghost"
            >
              <span>{showOptionalClient ? "Hide" : "Show"} optional client fields</span>
              <Caption className="rounded-sm border border-border bg-muted px-1.5 text-muted-foreground">
                {showOptionalClient ? "-" : "+"}
              </Caption>
            </Button>

            {showOptionalClient && (
              <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-2">
                <Field htmlFor="client-company" label="Client Company">
                  <Input
                    id="client-company"
                    type="text"
                    placeholder="Acme Corporates Inc."
                    value={data.client.company || ""}
                    onChange={(e) => updateClient({ company: e.target.value })}
                  />
                </Field>

                <Field error={errors["client.email"]} htmlFor="client-email" label="Client Email">
                  <Input
                    aria-invalid={Boolean(errors["client.email"])}
                    id="client-email"
                    type="email"
                    placeholder="billing@acmehomeservices.com"
                    value={data.client.email || ""}
                    onChange={(e) => updateClient({ email: e.target.value })}
                  />
                </Field>

                <Field htmlFor="client-phone" label="Client Phone">
                  <Input
                    id="client-phone"
                    type="text"
                    placeholder="(415) 888-9900"
                    value={data.client.phone || ""}
                    onChange={(e) => updateClient({ phone: e.target.value })}
                  />
                </Field>

                <Field htmlFor="client-addr-2" label="Client Address Line 2">
                  <Input
                    id="client-addr-2"
                    type="text"
                    placeholder="Floor 12"
                    value={data.client.addressLine2 || ""}
                    onChange={(e) => updateClient({ addressLine2: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 3. INVOICE META DETAILS BLOCK */}
      <SectionCard id="meta-editor-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <Calendar aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Invoice Metadata
          </H3>
        </CardHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field error={errors["invoice.invoiceNumber"]} htmlFor="inv-num" label="Invoice Number" required>
            <Input
              aria-invalid={Boolean(errors["invoice.invoiceNumber"])}
              id="inv-num"
              type="text"
              placeholder={`INV-${new Date().getFullYear()}-001`}
              value={data.invoice.invoiceNumber || ""}
              onChange={(e) => updateInvoiceMeta({ invoiceNumber: e.target.value })}
            />
          </Field>

          <Field htmlFor="inv-terms" label="Payment Terms">
            <Select
              id="inv-terms"
              value={data.invoice.paymentTerms || "Net 30"}
              onChange={(e) => updateInvoiceMeta({ paymentTerms: e.target.value })}
            >
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="Net 7">Net 7 (7 Days)</option>
              <option value="Net 15">Net 15 (15 Days)</option>
              <option value="Net 30">Net 30 (30 Days)</option>
              <option value="Net 45">Net 45 (45 Days)</option>
              <option value="Custom">Custom Terms (Select Date Manually)</option>
            </Select>
          </Field>

          <Field error={errors["invoice.invoiceDate"]} htmlFor="inv-date-issue" label="Invoice Date" required>
            <Input
              aria-invalid={Boolean(errors["invoice.invoiceDate"])}
              id="inv-date-issue"
              type="date"
              value={data.invoice.invoiceDate || ""}
              onChange={(e) => updateInvoiceMeta({ invoiceDate: e.target.value })}
            />
          </Field>

          <Field
            description={data.invoice.paymentTerms !== "Custom" ? "Calculated automatically based on terms" : undefined}
            error={errors["invoice.dueDate"]}
            htmlFor="inv-date-due"
            label="Due Date"
            required
          >
            <Input
              aria-invalid={Boolean(errors["invoice.dueDate"])}
              id="inv-date-due"
              type="date"
              value={data.invoice.dueDate || ""}
              onChange={(e) => updateInvoiceMeta({ dueDate: e.target.value })}
              disabled={data.invoice.paymentTerms !== "Custom"}
            />
          </Field>

          {/* Optional sub-fields PO / Project */}
          <div className="mt-1 grid grid-cols-1 gap-4 border-t border-border pt-4 md:col-span-2 md:grid-cols-2">
            <Field htmlFor="inv-project" label="Project Name (Optional)">
              <Input
                id="inv-project"
                type="text"
                placeholder="e.g. Q2 System Migration"
                value={data.invoice.projectName || ""}
                onChange={(e) => updateInvoiceMeta({ projectName: e.target.value })}
              />
            </Field>

            <Field htmlFor="inv-po" label="Purchase Order (PO) Number (Optional)">
              <Input
                id="inv-po"
                type="text"
                placeholder="e.g. PO-8874-AC"
                value={data.invoice.poNumber || ""}
                onChange={(e) => updateInvoiceMeta({ poNumber: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      {/* 4. LINE ITEMS INVOICED BLOCK */}
      <SectionCard id="items-editor-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <Layers aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Line Items Table
          </H3>
          <CardAction>
            <Button onClick={addLineItem} size="sm" type="button" variant="secondary">
              <Plus aria-hidden="true" className="size-4" />
              Add row
            </Button>
          </CardAction>
        </CardHeader>

        {errors["lineItems"] && <AlertBanner variant="error">{errors["lineItems"]}</AlertBanner>}

        {/* Dynamic Items list */}
        <div className="space-y-4">
          {/* Header titles for large viewports */}
          <div className="hidden grid-cols-12 gap-3 border-b border-border pb-2 text-muted-foreground md:grid">
            <div className="col-span-6">
              <Overline>
                Description <span className="text-destructive">*</span>
              </Overline>
            </div>
            <div className="col-span-2 text-center">
              <Overline>
                Qty <span className="text-destructive">*</span>
              </Overline>
            </div>
            <div className="col-span-2 text-center">
              <Overline>
                Unit Price ($) <span className="text-destructive">*</span>
              </Overline>
            </div>
            <div className="col-span-1 text-center">
              <Overline>Tax</Overline>
            </div>
            <div className="col-span-1 text-right">
              <Overline>Actions</Overline>
            </div>
          </div>

          <div className="space-y-4 md:space-y-2">
            {data.lineItems.map((item, index) => {
              const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
              const hasErr =
                errors[`lineItems[${index}].description`] ||
                errors[`lineItems[${index}].quantity`] ||
                errors[`lineItems[${index}].unitPrice`];
              const descriptionId = `line-item-${item.id}-description`;
              const quantityId = `line-item-${item.id}-quantity`;
              const unitPriceId = `line-item-${item.id}-unit-price`;

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-12 md:border-0 md:bg-transparent md:p-0 ${
                    hasErr ? "border-destructive ring-2 ring-destructive/10" : ""
                  }`}
                  id={`form-line-item-${index}`}
                >
                  {/* Item Description */}
                  <div className="col-span-1 md:col-span-6">
                    <Label className="block pb-1 text-muted-foreground md:sr-only" htmlFor={descriptionId}>
                      Description <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      aria-errormessage={
                        errors[`lineItems[${index}].description`] ? `${descriptionId}-error` : undefined
                      }
                      aria-invalid={Boolean(errors[`lineItems[${index}].description`])}
                      className="h-9"
                      id={descriptionId}
                      type="text"
                      placeholder="e.g. Website maintenance / Performance testing"
                      value={item.description || ""}
                      onChange={(e) => handleLineItemChange(item.id, "description", e.target.value)}
                    />
                    {errors[`lineItems[${index}].description`] && (
                      <Caption className="mt-1 block text-destructive" id={`${descriptionId}-error`} role="alert">
                        {errors[`lineItems[${index}].description`]}
                      </Caption>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="col-span-1 md:col-span-2">
                    <Label className="block pb-1 text-muted-foreground md:sr-only" htmlFor={quantityId}>
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      aria-errormessage={errors[`lineItems[${index}].quantity`] ? `${quantityId}-error` : undefined}
                      aria-invalid={Boolean(errors[`lineItems[${index}].quantity`])}
                      className="h-9 text-center"
                      id={quantityId}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="1"
                      value={item.quantity === null || item.quantity === undefined ? "" : item.quantity}
                      onChange={(e) => handleLineItemChange(item.id, "quantity", e.target.value)}
                    />
                    {errors[`lineItems[${index}].quantity`] && (
                      <Caption className="mt-1 block text-destructive" id={`${quantityId}-error`} role="alert">
                        {errors[`lineItems[${index}].quantity`]}
                      </Caption>
                    )}
                  </div>

                  {/* Unit price */}
                  <div className="col-span-1 md:col-span-2">
                    <Label className="block pb-1 text-muted-foreground md:sr-only" htmlFor={unitPriceId}>
                      Unit Price ($) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      aria-errormessage={errors[`lineItems[${index}].unitPrice`] ? `${unitPriceId}-error` : undefined}
                      aria-invalid={Boolean(errors[`lineItems[${index}].unitPrice`])}
                      className="h-9 text-right"
                      id={unitPriceId}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={item.unitPrice === null || item.unitPrice === undefined ? "" : item.unitPrice}
                      onChange={(e) => handleLineItemChange(item.id, "unitPrice", e.target.value)}
                    />
                    {errors[`lineItems[${index}].unitPrice`] && (
                      <Caption className="mt-1 block text-destructive" id={`${unitPriceId}-error`} role="alert">
                        {errors[`lineItems[${index}].unitPrice`]}
                      </Caption>
                    )}
                  </div>

                  {/* Taxable boolean Checkbox */}
                  <div className="col-span-1 flex items-center justify-between border-t border-border py-1 md:col-span-1 md:justify-center md:border-0">
                    <Caption className="block text-muted-foreground md:hidden">Taxable:</Caption>
                    <CheckboxControl
                      aria-label={`Taxable line item ${index + 1}`}
                      checked={item.taxable || false}
                      onCheckedChange={(checked) => handleLineItemChange(item.id, "taxable", checked === true)}
                      id={`line-item-taxable-${item.id}`}
                      className="size-4 rounded border-input accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>

                  {/* Duplicate & deletion actions */}
                  <div className="col-span-1 flex items-center justify-end gap-1 border-t border-border pt-2.5 md:col-span-1 md:border-0 md:pt-0">
                    <Button
                      aria-label="Duplicate row"
                      type="button"
                      title="Duplicate row"
                      onClick={() => duplicateLineItem(item)}
                      size="icon"
                      variant="secondary"
                    >
                      <Copy aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      aria-label="Delete row"
                      type="button"
                      title="Delete row"
                      onClick={() => removeLineItem(item.id)}
                      size="icon"
                      variant="danger-subtle"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* 5. DISCOUNTS TAX AND FEES DETAILS BLOCK */}
      <SectionCard id="discounts-tax-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <FileSpreadsheet aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Discounts, Taxes &amp; Fees
          </H3>
        </CardHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Discount Trigger type */}
          <Field htmlFor="disc-type" label="Discount Type">
            <Select
              id="disc-type"
              value={data.totalsConfig.discountType || "none"}
              onChange={(e) => updateTotalsConfig({ discountType: e.target.value as any })}
            >
              <option value="none">No Discount</option>
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed Flat Dollar ($)</option>
            </Select>
          </Field>

          {/* Discount value input */}
          {data.totalsConfig.discountType !== "none" && (
            <Field
              htmlFor="disc-val"
              label={`Discount Value ${data.totalsConfig.discountType === "percent" ? "(%)" : "($)"}`}
            >
              <Input
                id="disc-val"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={
                  data.totalsConfig.discountValue === null || data.totalsConfig.discountValue === undefined
                    ? ""
                    : data.totalsConfig.discountValue
                }
                onChange={(e) =>
                  updateTotalsConfig({
                    discountValue: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
            </Field>
          )}

          {/* Tax rate description */}
          <Field htmlFor="tax-lbl" label="Sales Tax Label">
            <Input
              id="tax-lbl"
              type="text"
              placeholder="Sales Tax"
              value={data.totalsConfig.taxLabel || ""}
              onChange={(e) => updateTotalsConfig({ taxLabel: e.target.value })}
            />
          </Field>

          <Field htmlFor="tax-rt" label="Sales Tax Rate (%)">
            <Input
              id="tax-rt"
              type="number"
              min="0"
              max="100"
              step="any"
              placeholder="0.00"
              value={
                data.totalsConfig.taxRate === null || data.totalsConfig.taxRate === undefined
                  ? ""
                  : data.totalsConfig.taxRate
              }
              onChange={(e) => updateTotalsConfig({ taxRate: e.target.value === "" ? 0 : Number(e.target.value) })}
            />
          </Field>

          {/* Shipping fee & amount pre-paid */}
          <Field htmlFor="shipping-fee" label="Shipping / Handling Fee ($)">
            <Input
              id="shipping-fee"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={
                data.totalsConfig.shippingFee === null || data.totalsConfig.shippingFee === undefined
                  ? ""
                  : data.totalsConfig.shippingFee
              }
              onChange={(e) =>
                updateTotalsConfig({
                  shippingFee: e.target.value === "" ? 0 : Number(e.target.value),
                })
              }
            />
          </Field>

          <Field htmlFor="amt-paid" label="Amount Paid already ($) (for Partial Payments)">
            <Input
              id="amt-paid"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={
                data.totalsConfig.amountPaid === null || data.totalsConfig.amountPaid === undefined
                  ? ""
                  : data.totalsConfig.amountPaid
              }
              onChange={(e) =>
                updateTotalsConfig({
                  amountPaid: e.target.value === "" ? 0 : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </SectionCard>

      {/* 6. PAYMENT INSTRUCTIONS METHODS ACCORDION */}
      <SectionCard id="payments-editor-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Payment Methods &amp; Instructions
          </H3>
        </CardHeader>

        <div className="space-y-4">
          <div>
            <Text className="mb-2 block text-foreground">Accepted Payment Options</Text>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: "bank", label: "Bank Transfer" },
                { id: "check", label: "Check" },
                { id: "paypal", label: "PayPal" },
                { id: "venmo", label: "Venmo" },
                { id: "zelle", label: "Zelle" },
                { id: "card", label: "Credit Card" },
                { id: "cash", label: "Cash" },
              ].map((m) => {
                const checked = (data.payment.methods || []).includes(m.id);
                return (
                  <Label
                    key={m.id}
                    className={`flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 outline-none transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleMethodCheckbox(m.id)}
                      className="sr-only"
                    />
                    <span>{m.label}</span>
                  </Label>
                );
              })}
            </div>
          </div>

          <Field htmlFor="pay-inst" label="Payment Instructions Text (Displays on PDF)">
            <Textarea
              id="pay-inst"
              rows={3}
              placeholder="Direct bank wire details, PayPal ID emails, or instructions for paper check delivery address..."
              value={data.payment.instructions || ""}
              onChange={(e) => updatePaymentInfo({ instructions: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 7. GENERAL NOTES TERMS BLOCK WITH QUICK INSERT CHIPS */}
      <SectionCard id="notes-terms-section">
        <CardHeader className="gap-0">
          <H3 className="flex items-center gap-2">
            <PlusCircle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            Terms, Notes &amp; Late Fees
          </H3>
        </CardHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Label className="text-foreground" htmlFor="notes-textarea">
                Notes / Scope of Work Details
              </Label>
              <div className="flex items-center gap-1">
                <Caption className="text-muted-foreground">Quick insert:</Caption>
              </div>
            </div>

            {/* Quick insert chips */}
            <div className="mb-2 flex flex-wrap gap-1">
              {quickNotes.map((note, idx) => (
                <Button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertNote(note)}
                  className="h-auto max-w-[150px] truncate rounded-full px-2 py-1 sm:max-w-none"
                  size="sm"
                  title={note}
                  variant="secondary"
                >
                  + {note.replace(/(\.|\?)/g, "").substr(0, 20)}...
                </Button>
              ))}
            </div>

            <Textarea
              id="notes-textarea"
              rows={3}
              placeholder="Add personal updates, detail delivery receipts, or custom descriptions..."
              value={data.notes.notes || ""}
              onChange={(e) => updateNotesTerms({ notes: e.target.value })}
            />
          </div>

          <Field htmlFor="terms-textarea" label="Terms &amp; Business Agreements">
            <Textarea
              id="terms-textarea"
              rows={3}
              placeholder="e.g. Terms Net 30 default agreement terms. All payments are due by dates assigned."
              value={data.notes.terms || ""}
              onChange={(e) => updateNotesTerms({ terms: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}
