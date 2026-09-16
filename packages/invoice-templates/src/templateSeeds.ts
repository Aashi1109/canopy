/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InvoiceTemplate, LayoutFamily, TemplateCategory } from "./templateTypes.ts";
import { getDefaultTemplateConfigByFamily } from "./templateDefaults.ts";

const makeBaseConfig = (
  id: string,
  name: string,
  slug: string,
  category: TemplateCategory,
  layoutFamily: LayoutFamily,
  isDefault = false,
): InvoiceTemplate => {
  const baseConfig = getDefaultTemplateConfigByFamily(layoutFamily);

  return {
    id,
    name,
    slug,
    description: `A ${category} layout tailored for high efficiency and crisp presentation.`,
    category,
    status: "published",
    isDefault,
    version: 1,
    documentType: "invoice",
    layoutFamily,
    config: baseConfig,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  };
};

// Now, serialize the 6 pre-seeded templates with specialized styles
export const seedTemplates: InvoiceTemplate[] = [
  // 1. Classic Professional (Default)
  {
    ...makeBaseConfig(
      "tpl_classic_prof",
      "Classic Professional",
      "classic-professional",
      "classic",
      "classic",
      true,
    ),
    description:
      "Standard formal corporate layout with a safe, traditional grid. Ideal for law firms, consultants, and contractors.",
    config: {
      ...getDefaultTemplateConfigByFamily("classic"),
      theme: {
        primaryColor: "#0f172a", // slate-900 (High contrast professional)
        accentColor: "#3b82f6", // blue-500
        textColor: "#1e293b", // slate-800
        mutedTextColor: "#64748b", // slate-500
        borderColor: "#cbd5e1", // slate-300
        backgroundColor: "#f8fafc", // slate-50
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "Inter",
        headingSize: "md",
        bodySize: "sm",
        lineHeight: "normal",
      },
      header: {
        style: "left-logo",
        logoPosition: "left",
        logoSize: "sm",
        showInvoiceTitle: true,
        invoiceTitleText: "INVOICE",
        showStatusBadge: true,
      },
      lineItemsTable: {
        style: "striped",
        headerBackground: true,
        showItemNumbers: false,
        showTaxableColumn: true,
        descriptionLabel: "Item Description",
        quantityLabel: "Qty",
        rateLabel: "Rate",
        amountLabel: "Amount",
      },
    },
  },

  // 2. Modern Clean
  {
    ...makeBaseConfig("tpl_modern_clean", "Modern Clean", "modern-clean", "modern", "modern"),
    description:
      "A clean, spacious layout using elegant typography and airy spacing. Perfect for software engineers and digital design studios.",
    config: {
      ...getDefaultTemplateConfigByFamily("modern"),
      theme: {
        primaryColor: "#312e81", // indigo-900
        accentColor: "#6366f1", // indigo-500
        textColor: "#0f172a",
        mutedTextColor: "#475569",
        borderColor: "#cbd5e1",
        backgroundColor: "#eef2f6",
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "Space Grotesk",
        headingSize: "lg",
        bodySize: "sm",
        lineHeight: "relaxed",
      },
      header: {
        style: "split",
        logoPosition: "left",
        logoSize: "md",
        showInvoiceTitle: true,
        invoiceTitleText: "INVOICE STATEMENT",
        showStatusBadge: true,
      },
      lineItemsTable: {
        style: "simple",
        headerBackground: false,
        showItemNumbers: true,
        showTaxableColumn: false,
        descriptionLabel: "Description of Work",
        quantityLabel: "Hours",
        rateLabel: "Hourly Rate",
        amountLabel: "Subtotal",
      },
      totalsBlock: {
        position: "right",
        style: "boxed",
        showSubtotal: true,
        showDiscount: true,
        showTax: true,
        showShipping: false,
        showAmountPaid: true,
        showBalanceDue: true,
        emphasizeBalanceDue: true,
      },
    },
  },

  // 3. Compact Service Invoice
  {
    ...makeBaseConfig(
      "tpl_compact_service",
      "Compact Service Invoice",
      "compact-service",
      "service",
      "compact",
    ),
    description:
      "Density-optimized structural grid designed to pack many rows of fields. Great for handymen, field agents, auto repairs, and cleaning services.",
    config: {
      ...getDefaultTemplateConfigByFamily("compact"),
      theme: {
        primaryColor: "#0284c7", // sky-600
        accentColor: "#0ea5e9", // sky-500
        textColor: "#1c1917", // warm-stone-900
        mutedTextColor: "#57534e", // warm-stone-600
        borderColor: "#e7e5e4", // warm-stone-200
        backgroundColor: "#fafaf9", // warm-stone-50
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "Inter",
        headingSize: "sm",
        bodySize: "xs",
        lineHeight: "tight",
      },
      page: {
        size: "LETTER",
        margin: "compact",
        showPageBorder: false,
      },
      header: {
        style: "minimal",
        logoPosition: "right",
        logoSize: "sm",
        showInvoiceTitle: true,
        invoiceTitleText: "BILL OF SERVICE",
        showStatusBadge: false,
      },
      lineItemsTable: {
        style: "simple",
        headerBackground: true,
        showItemNumbers: false,
        showTaxableColumn: true,
        descriptionLabel: "Service Item / Material Supplied",
        quantityLabel: "Units",
        rateLabel: "Rate ($)",
        amountLabel: "Cost",
      },
    },
  },

  // 4. Bold Agency
  {
    ...makeBaseConfig("tpl_bold_agency", "Bold Agency", "bold-agency", "creative", "bold"),
    description:
      "Highly colorful, premium grid with high visual confidence. Designed specifically for advertising, creative consulting, and brand strategy agencies.",
    config: {
      ...getDefaultTemplateConfigByFamily("bold"),
      theme: {
        primaryColor: "#dc2626", // red-600
        accentColor: "#f43f5e", // rose-500
        textColor: "#111827",
        mutedTextColor: "#4b5563",
        borderColor: "#f3f4f6",
        backgroundColor: "#fef2f2",
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "Outfit",
        headingSize: "xl",
        bodySize: "sm",
        lineHeight: "normal",
      },
      header: {
        style: "centered",
        logoPosition: "center",
        logoSize: "lg",
        showInvoiceTitle: true,
        invoiceTitleText: "STATEMENT",
        showStatusBadge: true,
      },
      lineItemsTable: {
        style: "bordered",
        headerBackground: true,
        showItemNumbers: true,
        showTaxableColumn: true,
        descriptionLabel: "Agency Sprints / Deliverables",
        quantityLabel: "Qty",
        rateLabel: "Fee",
        amountLabel: "Total Budget",
      },
      totalsBlock: {
        position: "full-width",
        style: "highlight-total",
        showSubtotal: true,
        showDiscount: true,
        showTax: true,
        showShipping: false,
        showAmountPaid: true,
        showBalanceDue: true,
        emphasizeBalanceDue: true,
      },
    },
  },

  // 5. Minimal Freelancer
  {
    ...makeBaseConfig(
      "tpl_minimal_free",
      "Minimal Freelancer",
      "minimal-freelancer",
      "simple",
      "minimal",
    ),
    description:
      "Ultra elegant, sparse, layout with low ink usage and high white-space contrast. Fits copywriters, independent developers, and content writers.",
    config: {
      ...getDefaultTemplateConfigByFamily("minimal"),
      theme: {
        primaryColor: "#18181b", // zinc-900
        accentColor: "#27272a", // zinc-800
        textColor: "#27272a",
        mutedTextColor: "#71717a",
        borderColor: "#e4e4e7",
        backgroundColor: "#ffffff",
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "JetBrains Mono",
        headingSize: "sm",
        bodySize: "sm",
        lineHeight: "relaxed",
      },
      header: {
        style: "minimal",
        logoPosition: "left",
        logoSize: "xs",
        showInvoiceTitle: false,
        invoiceTitleText: "INVOICE",
        showStatusBadge: false,
      },
      lineItemsTable: {
        style: "minimal",
        headerBackground: false,
        showItemNumbers: false,
        showTaxableColumn: false,
        descriptionLabel: "Deliverable",
        quantityLabel: "Count",
        rateLabel: "Price",
        amountLabel: "Sum",
      },
      totalsBlock: {
        position: "right",
        style: "simple",
        showSubtotal: true,
        showDiscount: false,
        showTax: false,
        showShipping: false,
        showAmountPaid: false,
        showBalanceDue: true,
        emphasizeBalanceDue: false,
      },
    },
  },

  // 6. Detailed Contractor
  {
    ...makeBaseConfig(
      "tpl_detailed_contract",
      "Detailed Contractor",
      "detailed-contract",
      "professional",
      "service",
    ),
    description:
      "Includes visible placeholders for Purchase Orders, project milestones, complex terms, and detailed payment accounts.",
    config: {
      ...getDefaultTemplateConfigByFamily("service"),
      theme: {
        primaryColor: "#0f766e", // teal-700
        accentColor: "#0d9488", // teal-600
        textColor: "#0f172a",
        mutedTextColor: "#4f4f4f",
        borderColor: "#cbd5e1",
        backgroundColor: "#f0fdfa", // teal-50
        surfaceColor: "#ffffff",
      },
      typography: {
        fontFamily: "Georgia",
        headingSize: "md",
        bodySize: "sm",
        lineHeight: "tight",
      },
      header: {
        style: "right-meta",
        logoPosition: "left",
        logoSize: "sm",
        showInvoiceTitle: true,
        invoiceTitleText: "Milestone Invoice",
        showStatusBadge: true,
      },
      lineItemsTable: {
        style: "bordered",
        headerBackground: true,
        showItemNumbers: true,
        showTaxableColumn: true,
        descriptionLabel: "Scope Milestone / Task Details",
        quantityLabel: "Hours",
        rateLabel: "Rate ($)",
        amountLabel: "Milestone Bill",
      },
    },
  },
];
