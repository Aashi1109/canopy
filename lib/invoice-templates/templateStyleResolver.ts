/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CSSProperties } from "react";
import type { InvoiceTemplateConfig } from "./templateTypes.ts";

export interface StyleResolverResult {
  rootStyle: CSSProperties;
  primaryColorText: CSSProperties;
  primaryBg: CSSProperties;
  primaryBorder: CSSProperties;
  tableHeaderBg: CSSProperties;
  accentBg: CSSProperties;
  mutedText: CSSProperties;
  fontClass: string;
  marginClass: string;
}

export function resolveTemplateStyles(config: InvoiceTemplateConfig): StyleResolverResult {
  const { theme, typography, page } = config;

  // 1. Font Mappings
  let fontClass = "font-sans";
  let customFontFamily = "";

  if (typography.fontFamily === "Space Grotesk") {
    fontClass = "";
    customFontFamily = "'Space Grotesk', sans-serif";
  } else if (typography.fontFamily === "Outfit") {
    fontClass = "";
    customFontFamily = "'Outfit', sans-serif";
  } else if (typography.fontFamily === "JetBrains Mono") {
    fontClass = "font-mono";
  } else if (typography.fontFamily === "Georgia") {
    fontClass = "font-serif";
  } else if (typography.fontFamily === "Times-Roman") {
    fontClass = "font-serif";
  } else if (typography.fontFamily === "Courier") {
    fontClass = "font-mono";
  }

  // 2. Margin Mappings
  let marginClass = "p-8";
  if (page.margin === "compact") {
    marginClass = "p-4";
  } else if (page.margin === "spacious") {
    marginClass = "p-12";
  }

  // Styles map
  return {
    rootStyle: {
      color: theme.textColor,
      borderColor: theme.borderColor,
      fontFamily: customFontFamily || undefined,
      lineHeight: typography.lineHeight === "tight" ? 1.25 : typography.lineHeight === "relaxed" ? 1.75 : 1.5,
      fontSize: typography.bodySize === "xs" ? "12px" : typography.bodySize === "md" ? "15px" : "14px",
    },
    primaryColorText: {
      color: theme.primaryColor,
    },
    primaryBg: {
      backgroundColor: theme.primaryColor,
    },
    primaryBorder: {
      borderColor: theme.primaryColor,
    },
    tableHeaderBg: config.lineItemsTable.headerBackground
      ? { backgroundColor: theme.primaryColor, color: theme.surfaceColor }
      : { backgroundColor: theme.backgroundColor, color: theme.textColor },
    accentBg: {
      backgroundColor: theme.accentColor,
    },
    mutedText: {
      color: theme.mutedTextColor,
    },
    fontClass,
    marginClass,
  };
}

/**
 * Returns available font weights and declarations to inject into DOM for Live Preview if they are custom
 */
export function getFontGoogleLink(fontFamily: string): string {
  switch (fontFamily) {
    case "Space Grotesk":
      return "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap";
    case "Outfit":
      return "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800&display=swap";
    case "Inter":
      return "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    default:
      return "";
  }
}
