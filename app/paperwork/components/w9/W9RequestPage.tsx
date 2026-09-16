"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import type { DocumentTemplate } from "@smarttools/invoice-templates";
import {
  FieldError,
  FieldDescription,
  Caption,
  H3,
  Overline,
  P,
  Button,
  ToolActionButton,
  Card,
  Input,
  Label,
  Select,
  StatusBadge,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  ToolPageHeader,
} from "@smarttools/ui";
import {
  FileText,
  Clock,
  Printer,
  FileDown,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Download,
  Percent,
  CheckCircle,
  HelpCircle,
  Info,
  ChevronRight,
  Mail,
  UserCheck,
  Building,
  Briefcase,
} from "lucide-react";
import { DataBridge, DataBridgeKeys, VendorProfile } from "@/lib/paperwork/shared/dataBridge";
import { createW9Request, W9_REQUEST_DISCLAIMER } from "@/lib/paperwork/contractorTaxRules";
import { w9RequestAdapter } from "@/lib/paperwork/documentAdapters";
import AdvancedTemplateWorkspace from "../AdvancedTemplateWorkspace";

const ENTITY_TYPES = ["Individual", "LLC", "Partnership", "Corporation", "Unknown"];
const W9_STATUS_OPTIONS = [
  "Not Requested",
  "Requested",
  "Received",
  "Needs Review",
  "Not Applicable",
];

export const DEFAULT_W9_VENDORS: VendorProfile[] = [
  {
    id: "vendor-1",
    legalName: "Devon Lane",
    businessName: "Devon Dev LLC",
    email: "devon@lanestudio.com",
    phone: "+1 (555) 441-2820",
    addressLine1: "192 Silver Maple Ave, Seattle, WA 98101",
    entityType: "LLC",
    w9Status: "Received",
    notes: "Contract Ruby-on-Rails setup milestone developer.",
  },
];

export interface W9RequestDraft {
  requesterName: string;
  requesterEmail: string;
  requesterAddress: string;
  reportingYear: number;
  requestDate: string;
  dueDate: string;
  message: string;
  secureSubmissionInstructions: string;
  supportContact: string;
  requestStatus: string;
  vendors: VendorProfile[];
}

export const DEFAULT_W9_REQUEST_DRAFT: W9RequestDraft = {
  requesterName: "",
  requesterEmail: "",
  requesterAddress: "",
  reportingYear: 2026,
  requestDate: new Date().toISOString().substring(0, 10),
  dueDate: "",
  message: "Please complete the current official IRS Form W-9.",
  secureSubmissionInstructions:
    "Upload the completed form through your organization's approved secure vendor portal. Do not return it by ordinary email.",
  supportContact: "",
  requestStatus: "Requested",
  vendors: DEFAULT_W9_VENDORS,
};

export const SAMPLE_W9_REQUEST_DRAFT: W9RequestDraft = {
  ...DEFAULT_W9_REQUEST_DRAFT,
  requesterName: "Northstar Studio LLC",
  requesterEmail: "accounts@northstar.example",
  requesterAddress: "42 Market Street, Austin, TX 78701",
  requestDate: "2026-07-23",
  dueDate: "2026-08-06",
  supportContact: "accounts@northstar.example",
};

export function normalizeW9RequestDraft(draft: Partial<W9RequestDraft>): W9RequestDraft {
  const vendors = (draft.vendors || DEFAULT_W9_VENDORS).map((vendor) => ({
    id: String(vendor.id || `vendor-${Date.now()}`),
    legalName: String(vendor.legalName || ""),
    businessName: String(vendor.businessName || ""),
    email: String(vendor.email || ""),
    phone: String(vendor.phone || ""),
    addressLine1: String(vendor.addressLine1 || ""),
    city: vendor.city ? String(vendor.city) : undefined,
    state: vendor.state ? String(vendor.state) : undefined,
    zipCode: vendor.zipCode ? String(vendor.zipCode) : undefined,
    entityType: vendor.entityType || "Unknown",
    w9Status: vendor.w9Status || "Not Requested",
    notes: String(vendor.notes || ""),
  }));
  return {
    requesterName: String(draft.requesterName || ""),
    requesterEmail: String(draft.requesterEmail || ""),
    requesterAddress: String(draft.requesterAddress || ""),
    reportingYear: Number(draft.reportingYear || 2026),
    requestDate: String(draft.requestDate || DEFAULT_W9_REQUEST_DRAFT.requestDate),
    dueDate: String(draft.dueDate || ""),
    message: String(draft.message || DEFAULT_W9_REQUEST_DRAFT.message),
    secureSubmissionInstructions: String(
      draft.secureSubmissionInstructions || DEFAULT_W9_REQUEST_DRAFT.secureSubmissionInstructions,
    ),
    supportContact: String(draft.supportContact || ""),
    requestStatus: String(draft.requestStatus || DEFAULT_W9_REQUEST_DRAFT.requestStatus),
    vendors,
  };
}

export default function W9RequestPage({
  onTrackClick,
  templates = [],
}: {
  onTrackClick: (item: string) => void;
  templates?: readonly DocumentTemplate[];
}) {
  const [draft, setDraft] = useState<W9RequestDraft>(() => {
    const storedDraft = DataBridge.get<Partial<W9RequestDraft>>("paperworkkit.w9Request.draft", {});
    const vendors = DataBridge.getW9Vendors();
    return normalizeW9RequestDraft({
      ...storedDraft,
      vendors: vendors.length ? vendors : storedDraft.vendors,
    });
  });
  const vendors = draft.vendors;
  const setVendors = (nextVendors: VendorProfile[]) =>
    setDraft((current) => ({ ...current, vendors: nextVendors }));

  const [selectedVendorId, setSelectedVendorId] = useState<string>(() => vendors[0]?.id || "");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form states for creating/editing vendor
  const [formName, setFormName] = useState("");
  const [formBiz, setFormBiz] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formEntity, setFormEntity] = useState<any>("Individual");
  const [formStatus, setFormStatus] = useState<any>("Not Requested");
  const [formNotes, setFormNotes] = useState("");

  const [activeTab, setActiveTab] = useState<"onboarding" | "email">("onboarding");

  // Sync state to memory
  useEffect(() => {
    DataBridge.saveW9Vendors(vendors);
    DataBridge.set("paperworkkit.w9Request.draft", draft);
  }, [draft, vendors]);

  // Load details to editor upon selection
  const activeVendor = vendors.find((v) => v.id === selectedVendorId) || vendors[0];

  useEffect(() => {
    if (activeVendor) {
      setFormName(activeVendor.legalName);
      setFormBiz(activeVendor.businessName);
      setFormEmail(activeVendor.email);
      setFormPhone(activeVendor.phone);
      setFormAddress(activeVendor.addressLine1);
      setFormEntity(activeVendor.entityType);
      setFormStatus(activeVendor.w9Status);
      setFormNotes(activeVendor.notes);
    }
  }, [selectedVendorId, activeVendor]);

  const handleUpdateVendorDetail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrors({ formName: "Contractor Legal Name is required to formulate profiles." });
      return;
    }
    setErrors({});

    const updated = vendors.map((v) => {
      if (v.id === selectedVendorId) {
        return {
          ...v,
          legalName: formName,
          businessName: formBiz,
          email: formEmail,
          phone: formPhone,
          addressLine1: formAddress,
          entityType: formEntity,
          w9Status: formStatus,
          notes: formNotes,
        };
      }
      return v;
    });

    setVendors(updated);
    alert("Contractor profile parameters updated!");
    onTrackClick("w9_vendor_updated");
  };

  const handleCreateNewVendor = () => {
    const fresh: VendorProfile = {
      id: `vendor-${Date.now()}`,
      legalName: "New Contractor Partner",
      businessName: "",
      email: "",
      phone: "",
      addressLine1: "",
      entityType: "Individual",
      w9Status: "Not Requested",
      notes: "",
    };

    setVendors([...vendors, fresh]);
    setSelectedVendorId(fresh.id);
    onTrackClick("w9_vendor_created");
  };

  const handleRemoveVendor = (id: string) => {
    if (vendors.length <= 1) {
      alert("Keep at least one contractor listing to maintain profile alignment.");
      return;
    }
    if (confirm("Are you sure you want to remove this contractor from onboarding tracks?")) {
      const remaining = vendors.filter((v) => v.id !== id);
      setVendors(remaining);
      setSelectedVendorId(remaining[0].id);
      onTrackClick("w9_vendor_removed");
    }
  };

  // Generate compliance W9 request email blueprint
  const getEmailSubject = () => {
    return createW9Request({
      reportingYear: draft.reportingYear,
      contractorName: activeVendor?.legalName || "Contractor Partner",
      contractorBusinessName: activeVendor?.businessName,
      secureSubmissionInstructions: draft.secureSubmissionInstructions,
    }).subject;
  };

  const getEmailBody = () => {
    return createW9Request({
      reportingYear: draft.reportingYear,
      contractorName: activeVendor?.legalName || "Contractor Partner",
      contractorBusinessName: activeVendor?.businessName,
      secureSubmissionInstructions: draft.secureSubmissionInstructions,
    }).body;
  };

  const handleCopyEmailText = () => {
    const copyString = `Subject: ${getEmailSubject()}\n\n${getEmailBody()}`;
    navigator.clipboard.writeText(copyString);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
    onTrackClick("w9_email_copied_clicked");
  };

  return (
    <div
      className="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
      id="w9-onboarding-wrapper"
    >
      <ToolPageHeader
        actions={
          <Button onClick={handleCreateNewVendor} variant="strong">
            <Plus className="size-4" />
            <span>Onboard Contractor</span>
          </Button>
        }
        description="Maintain compliance folders for self-employed subcontractor entities, track verification status states, and request records."
        eyebrow={<StatusBadge variant="info">IRS Form 1099 Vendor Verification</StatusBadge>}
        title="W-9 Request & Onboarding Tracker"
      />

      <AdvancedTemplateWorkspace
        adapter={w9RequestAdapter}
        draft={draft}
        onDraftChange={setDraft}
        onTrackClick={onTrackClick}
        templates={templates}
      />

      {/* Main split panels layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* CONTRACTOR LIST SIDEBAR ROW */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="space-y-3">
            <Overline className="block text-slate-400 pl-1">Active Contractor Profiles</Overline>

            <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
              {vendors.map((vend) => (
                <div
                  key={vend.id}
                  className={`flex items-center justify-between rounded-xl border p-3 transition-all duration-150 ${selectedVendorId === vend.id ? "border-slate-900/60 bg-slate-50" : "border-slate-200 bg-white"}`}
                >
                  <Button
                    aria-pressed={selectedVendorId === vend.id}
                    className="h-auto min-w-0 grow justify-start whitespace-normal rounded-md px-0 text-left hover:bg-transparent hover:text-primary"
                    onClick={() => setSelectedVendorId(vend.id)}
                    type="button"
                    variant="ghost"
                  >
                    <span className="text-slate-950 block">{vend.legalName}</span>
                    {vend.businessName && (
                      <Caption className="text-slate-500 block">{vend.businessName}</Caption>
                    )}
                  </Button>

                  <div className="flex gap-2 items-center shrink-0">
                    <StatusBadge
                      variant={
                        vend.w9Status === "Received"
                          ? "success"
                          : vend.w9Status === "Requested"
                            ? "warning"
                            : vend.w9Status === "Needs Review"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {vend.w9Status}
                    </StatusBadge>
                    <Button
                      type="button"
                      onClick={() => {
                        handleRemoveVendor(vend.id);
                      }}
                      aria-label="Remove contractor profile"
                      className="text-muted-foreground hover:text-destructive"
                      size="icon"
                      title="Remove profile"
                      variant="ghost"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* EDITOR OR COMPLIANCE EMAIL GENERATION */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tab sub headers */}
          <Tabs
            onValueChange={(value) => setActiveTab(value as "onboarding" | "email")}
            value={activeTab}
          >
            <TabsList
              className="grid w-full grid-cols-2 border border-slate-200"
              id="w9-tabs"
              variant="segmented"
            >
              <TabsTrigger className="whitespace-normal py-1.5" value="onboarding">
                <UserCheck className="w-4 h-4" />
                <span>1. Formulate Profile Metadata</span>
              </TabsTrigger>
              <TabsTrigger className="whitespace-normal py-1.5" value="email">
                <Mail className="w-4 h-4" />
                <span>2. Copy W-9 compliance request Email</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "onboarding" ? (
            <form
              onSubmit={handleUpdateVendorDetail}
              className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm"
            >
              <H3 className="text-slate-500 border-b pb-2">Verification credentials formulation</H3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-legal-name">
                    Contractor Legal Name *
                  </Label>
                  <Input
                    aria-describedby={errors.formName ? undefined : "w9-legal-name-description"}
                    aria-errormessage={errors.formName ? "w9-legal-name-error" : undefined}
                    type="text"
                    required
                    aria-invalid={Boolean(errors.formName)}
                    id="w9-legal-name"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (errors.formName) setErrors({});
                    }}
                  />
                  {errors.formName ? (
                    <FieldError
                      className="mt-1 text-destructive"
                      id="w9-legal-name-error"
                      role="alert"
                    >
                      {errors.formName}
                    </FieldError>
                  ) : (
                    <FieldDescription
                      className="text-slate-400 block mt-0.5"
                      id="w9-legal-name-description"
                    >
                      As registered on their IRS filing documents.
                    </FieldDescription>
                  )}
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-business-name">
                    Business DBA Name (if matching)
                  </Label>
                  <Input
                    type="text"
                    id="w9-business-name"
                    value={formBiz}
                    onChange={(e) => setFormBiz(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-email">
                    Email Coordinates
                  </Label>
                  <Input
                    type="email"
                    id="w9-email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-phone">
                    Support Phone
                  </Label>
                  <Input
                    id="w9-phone"
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-address">
                    Street address
                  </Label>
                  <Input
                    type="text"
                    id="w9-address"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-entity">
                    Tax Classification Entity
                  </Label>
                  <Select
                    id="w9-entity"
                    value={formEntity}
                    onChange={(e) => setFormEntity(e.target.value as any)}
                  >
                    {ENTITY_TYPES.map((ent) => (
                      <option key={ent} value={ent}>
                        {ent} / Sole Proprietor
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-status">
                    W-9 Request compliance status
                  </Label>
                  <Select
                    id="w9-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                  >
                    {W9_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-notes">
                    Notes / Project association description
                  </Label>
                  <Input
                    id="w9-notes"
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-3 border-t text-right">
                <Button type="submit" variant="strong">
                  Save Profile updates
                </Button>
              </div>
            </form>
          ) : (
            <Card className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <H3 className="text-slate-500">Compliance email template generator</H3>
                <ToolActionButton
                  action="copy"
                  icon={copiedEmail ? <Check /> : undefined}
                  onClick={handleCopyEmailText}
                  type="button"
                >
                  <span>{copiedEmail ? "CopiedSubjectBody!" : "Copy Subject + Body"}</span>
                </ToolActionButton>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[10rem_1fr]">
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-reporting-year">
                    Reporting year
                  </Label>
                  <Select
                    id="w9-reporting-year"
                    value={draft.reportingYear}
                    onChange={(event) =>
                      setDraft({ ...draft, reportingYear: Number(event.target.value) })
                    }
                  >
                    <option value={2026}>2026 ($2,000)</option>
                    <option value={2025}>2025 ($600)</option>
                  </Select>
                </div>
                <div>
                  <Label className="block text-slate-400 mb-1" htmlFor="w9-secure-submission">
                    Secure submission instructions
                  </Label>
                  <Textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2"
                    id="w9-secure-submission"
                    value={draft.secureSubmissionInstructions}
                    onChange={(event) =>
                      setDraft({ ...draft, secureSubmissionInstructions: event.target.value })
                    }
                  />
                </div>
              </div>

              <P className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                {W9_REQUEST_DISCLAIMER}
              </P>

              {/* Subject block */}
              <div className="bg-slate-50 p-3 rounded-lg border">
                <Overline className="block text-slate-400 mb-1">Email Subject Line</Overline>
                <P className="text-slate-900 select-all">{getEmailSubject()}</P>
              </div>

              {/* Body block */}
              <div className="bg-slate-50 p-4 rounded-lg border">
                <Overline className="block text-slate-400 mb-1">Email Body Description</Overline>
                <P className="whitespace-pre-line text-slate-700 select-all">{getEmailBody()}</P>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
