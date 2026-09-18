import type { CSSProperties, ReactNode } from "react";
import {
  calculateInvoicePreviewTotals,
  formatInvoicePreviewCurrency,
  serviceInvoiceSample,
  type InvoicePreviewData,
} from "./previewData.ts";
import type { InvoiceTemplate } from "./templateTypes.ts";

type PreviewTemplate = Pick<InvoiceTemplate, "config" | "layoutFamily" | "name">;

export interface InvoiceTemplatePreviewProps {
  data?: InvoicePreviewData;
  template: PreviewTemplate;
  variant?: "document" | "thumbnail";
}

const fallbackSectionOrder = [
  "header",
  "meta_info",
  "line_items",
  "totals",
  "payment_instructions",
  "notes_terms",
  "footer",
];

function addressLine(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export function InvoiceTemplatePreview({
  data = serviceInvoiceSample,
  template,
  variant = "document",
}: InvoiceTemplatePreviewProps) {
  const { config, layoutFamily } = template;
  const {
    businessBlock,
    clientBlock,
    footer,
    header,
    labels,
    lineItemsTable,
    metaBlock,
    notesBlock,
    page,
    paymentBlock,
    theme,
    totalsBlock,
    typography,
    visibility,
    watermark,
  } = config;
  const totals = calculateInvoicePreviewTotals(data);
  const thumbnail = variant === "thumbnail";
  const baseFontSize = typography.bodySize === "xs" ? 11 : typography.bodySize === "md" ? 14 : 12;
  const headingSize =
    typography.headingSize === "sm"
      ? 18
      : typography.headingSize === "lg"
        ? 26
        : typography.headingSize === "xl"
          ? 32
          : 22;
  const spacing = thumbnail ? 8 : page.margin === "compact" ? 16 : page.margin === "spacious" ? 28 : 22;
  const sectionGap = thumbnail ? 8 : page.margin === "compact" ? 14 : 20;
  const currency = (amount: number) => formatInvoicePreviewCurrency(amount, data.invoice.currency || "USD");
  const mutedStyle: CSSProperties = { color: theme.mutedTextColor };
  const sectionLabelStyle: CSSProperties = {
    ...mutedStyle,
    fontSize: "0.72em",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
  const detailTextStyle: CSSProperties = {
    ...mutedStyle,
    fontSize: "0.86em",
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  };
  const detailHeadingStyle: CSSProperties = { display: "block", fontSize: "0.82em" };
  const panelStyle: CSSProperties = {
    backgroundColor: theme.backgroundColor,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: layoutFamily === "minimal" ? 2 : thumbnail ? 5 : 10,
  };
  const contactText = [
    businessBlock.showContactName ? data.business.contactName : "",
    businessBlock.showEmail ? data.business.email : "",
    businessBlock.showPhone ? data.business.phone : "",
    businessBlock.showWebsite ? data.business.website : "",
  ].filter(Boolean);
  const logo =
    visibility.showLogo && data.business.logo ? (
      <img
        alt={`${data.business.name} logo`}
        src={data.business.logo}
        style={{
          display: "block",
          height: thumbnail
            ? 18
            : header.logoSize === "xs"
              ? 24
              : header.logoSize === "sm"
                ? 34
                : header.logoSize === "lg"
                  ? 58
                  : 44,
          maxWidth: thumbnail ? 70 : 150,
          objectFit: "contain",
        }}
      />
    ) : null;
  const logoJustify =
    header.logoPosition === "center" ? "center" : header.logoPosition === "right" ? "flex-end" : "flex-start";

  const standardHeader = (
    <header
      style={{
        alignItems: header.style === "centered" ? "center" : "flex-start",
        background: header.style === "split" ? theme.backgroundColor : undefined,
        borderBottom:
          header.style === "minimal" ? "none" : `${layoutFamily === "classic" ? 2 : 1}px solid ${theme.borderColor}`,
        display: "grid",
        gap: thumbnail ? 6 : 18,
        gridTemplateColumns: header.style === "centered" ? "1fr" : "minmax(0, 1fr) auto",
        margin: header.style === "split" ? `${-spacing / 2}px ${-spacing / 2}px 0` : undefined,
        padding: header.style === "split" ? (thumbnail ? 6 : 12) : undefined,
        paddingBottom: header.style === "split" ? undefined : thumbnail ? 6 : 14,
        textAlign: header.style === "centered" ? "center" : undefined,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {logo ? <div style={{ display: "flex", justifyContent: logoJustify, marginBottom: 6 }}>{logo}</div> : null}
        {visibility.showBusinessBlock && businessBlock.showBusinessName ? (
          <strong
            style={{
              color: theme.primaryColor,
              display: "block",
              fontSize: thumbnail ? 10 : headingSize,
              fontWeight: 800,
              lineHeight: 1.08,
              overflowWrap: "anywhere",
            }}
          >
            {data.business.name || "[Business Name]"}
          </strong>
        ) : null}
        {visibility.showBusinessBlock && businessBlock.position === "header" && !thumbnail ? (
          <div style={{ ...mutedStyle, fontSize: "0.82em", marginTop: 5 }}>
            {contactText.map((value) => (
              <div key={value} style={{ overflowWrap: "anywhere" }}>
                {value}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div
        style={{
          minWidth: thumbnail ? 62 : 130,
          textAlign: header.style === "centered" ? "center" : "right",
        }}
      >
        {header.showInvoiceTitle ? (
          <div
            style={{
              color: theme.primaryColor,
              borderBottom: `2px solid ${theme.accentColor}`,
              display: "inline-block",
              fontSize: thumbnail ? 10 : Math.max(18, headingSize - 2),
              fontWeight: 900,
              letterSpacing: "0.08em",
              lineHeight: 1,
              paddingBottom: thumbnail ? 1 : 3,
              textTransform: "uppercase",
            }}
          >
            {header.invoiceTitleText || labels.invoiceTitle}
          </div>
        ) : null}
        {header.showStatusBadge && !thumbnail ? (
          <span
            style={{
              background: theme.backgroundColor,
              border: `1px solid ${theme.borderColor}`,
              borderRadius: 999,
              color: theme.primaryColor,
              display: "inline-block",
              fontSize: 9,
              fontWeight: 800,
              marginTop: 6,
              padding: "2px 7px",
              textTransform: "uppercase",
            }}
          >
            Saved
          </span>
        ) : null}
        {visibility.showMetaBlock && metaBlock.position === "right-column" ? (
          <div
            style={{
              ...mutedStyle,
              fontSize: "0.82em",
              lineHeight: 1.45,
              marginTop: thumbnail ? 3 : 8,
            }}
          >
            {metaBlock.showInvoiceNumber ? (
              <strong style={{ color: theme.textColor }}>#{data.invoice.invoiceNumber}</strong>
            ) : null}
            {metaBlock.showInvoiceDate && !thumbnail ? (
              <div>
                {labels.invoiceDate}: {data.invoice.invoiceDate}
              </div>
            ) : null}
            {metaBlock.showDueDate ? (
              <div>
                {labels.dueDate}: {data.invoice.dueDate}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );

  const headerSection =
    layoutFamily === "bold" ? (
      <header
        style={{
          background: theme.primaryColor,
          color: theme.surfaceColor,
          display: "grid",
          gap: thumbnail ? 6 : 18,
          gridTemplateColumns: "minmax(0, 1fr) auto",
          margin: `${-spacing}px ${-spacing}px 0`,
          padding: thumbnail ? 10 : spacing,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {logo ? <div style={{ display: "flex", justifyContent: logoJustify, marginBottom: 5 }}>{logo}</div> : null}
          {visibility.showBusinessBlock && businessBlock.showBusinessName ? (
            <strong
              style={{
                display: "block",
                fontSize: thumbnail ? 10 : headingSize,
                overflowWrap: "anywhere",
              }}
            >
              {data.business.name}
            </strong>
          ) : null}
          {visibility.showBusinessBlock && !thumbnail && contactText.length ? (
            <div style={{ fontSize: "0.8em", marginTop: 5, opacity: 0.82 }}>{contactText.join(" · ")}</div>
          ) : null}
        </div>
        <div style={{ textAlign: "right" }}>
          {header.showInvoiceTitle ? (
            <div style={{ fontSize: thumbnail ? 10 : 20, fontWeight: 900, letterSpacing: "0.12em" }}>
              {header.invoiceTitleText || labels.invoiceTitle}
            </div>
          ) : null}
          {visibility.showMetaBlock && metaBlock.showInvoiceNumber ? (
            <strong style={{ display: "block", marginTop: 5 }}>#{data.invoice.invoiceNumber}</strong>
          ) : null}
          {visibility.showMetaBlock && metaBlock.showDueDate ? (
            <div style={{ fontSize: "0.82em", marginTop: 3 }}>Due {data.invoice.dueDate}</div>
          ) : null}
        </div>
      </header>
    ) : (
      standardHeader
    );

  const businessDetails =
    visibility.showBusinessBlock && businessBlock.position !== "header" ? (
      <div style={{ minWidth: 0 }}>
        <div style={sectionLabelStyle}>{labels.from}</div>
        {businessBlock.showBusinessName ? <strong>{data.business.name}</strong> : null}
        {!thumbnail ? (
          <div style={detailTextStyle}>
            {businessBlock.showAddress && data.business.addressLine1 ? (
              <div>{addressLine([data.business.addressLine1, data.business.addressLine2])}</div>
            ) : null}
            {businessBlock.showAddress ? (
              <div>{addressLine([data.business.city, data.business.state, data.business.zipCode])}</div>
            ) : null}
            {businessBlock.showEmail ? <div>{data.business.email}</div> : null}
            {businessBlock.showPhone ? <div>{data.business.phone}</div> : null}
            {businessBlock.showTaxId ? <div>{data.business.taxId}</div> : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const clientDetails = visibility.showClientBlock ? (
    <div
      style={{
        ...(layoutFamily === "modern" || layoutFamily === "service" ? panelStyle : {}),
        ...(layoutFamily === "classic" ? { borderLeft: `3px solid ${theme.primaryColor}` } : {}),
        minWidth: 0,
        gridColumn: clientBlock.position === "full-width" ? "1 / -1" : undefined,
        padding:
          layoutFamily === "modern" || layoutFamily === "service" || layoutFamily === "classic"
            ? thumbnail
              ? 6
              : 12
            : 0,
      }}
    >
      <div style={sectionLabelStyle}>{clientBlock.title || labels.billTo}</div>
      {clientBlock.showClientName ? (
        <strong style={{ display: "block", overflowWrap: "anywhere" }}>{data.client.name}</strong>
      ) : null}
      {clientBlock.showCompany && data.client.company ? <div>{data.client.company}</div> : null}
      {!thumbnail ? (
        <div style={detailTextStyle}>
          {clientBlock.showAddress && data.client.addressLine1 ? (
            <div>{addressLine([data.client.addressLine1, data.client.addressLine2])}</div>
          ) : null}
          {clientBlock.showAddress ? (
            <div>{addressLine([data.client.city, data.client.state, data.client.zipCode])}</div>
          ) : null}
          {clientBlock.showEmail ? <div>{data.client.email}</div> : null}
          {clientBlock.showPhone ? <div>{data.client.phone}</div> : null}
        </div>
      ) : null}
    </div>
  ) : null;

  const invoiceMeta =
    visibility.showMetaBlock && metaBlock.position !== "right-column" ? (
      <div
        style={{
          ...(metaBlock.position === "table" ? panelStyle : {}),
          minWidth: 0,
          padding: metaBlock.position === "table" ? (thumbnail ? 6 : 12) : 0,
        }}
      >
        <div style={sectionLabelStyle}>Invoice details</div>
        <div
          style={{
            display: "grid",
            fontSize: "0.86em",
            gap: 3,
            gridTemplateColumns: metaBlock.position === "table" ? "1fr 1fr" : "1fr",
            marginTop: 4,
          }}
        >
          {metaBlock.showInvoiceNumber ? (
            <div>
              <strong>{labels.invoiceNumber}:</strong> {data.invoice.invoiceNumber}
            </div>
          ) : null}
          {metaBlock.showInvoiceDate && !thumbnail ? (
            <div>
              <strong>{labels.invoiceDate}:</strong> {data.invoice.invoiceDate}
            </div>
          ) : null}
          {metaBlock.showDueDate ? (
            <div>
              <strong>{labels.dueDate}:</strong> {data.invoice.dueDate}
            </div>
          ) : null}
          {metaBlock.showPaymentTerms && !thumbnail ? (
            <div>
              <strong>{labels.paymentTerms}:</strong> {data.invoice.paymentTerms}
            </div>
          ) : null}
          {metaBlock.showPoNumber && data.invoice.poNumber ? (
            <div>
              <strong>{labels.poNumber}:</strong> {data.invoice.poNumber}
            </div>
          ) : null}
          {metaBlock.showProjectName && data.invoice.projectName ? (
            <div style={{ overflowWrap: "anywhere" }}>
              <strong>{labels.projectName}:</strong> {data.invoice.projectName}
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  const metaSection =
    clientDetails || businessDetails || invoiceMeta ? (
      <section
        style={{
          display: "grid",
          gap: thumbnail ? 7 : 16,
          gridTemplateColumns: thumbnail ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        {businessBlock.position === "right-column" || clientBlock.position === "left-column"
          ? clientDetails
          : businessDetails}
        {businessBlock.position === "right-column" || clientBlock.position === "left-column"
          ? businessDetails
          : clientDetails}
        {invoiceMeta}
      </section>
    ) : null;

  const displayedItems = thumbnail ? data.lineItems.slice(0, 2) : data.lineItems;
  const lineItemsSection = visibility.showLineItems ? (
    <section style={{ overflow: "hidden" }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: "0.9em",
          tableLayout: "fixed",
          width: "100%",
        }}
      >
        <thead
          style={{
            background: lineItemsTable.headerBackground ? theme.primaryColor : "transparent",
            color: lineItemsTable.headerBackground ? theme.surfaceColor : theme.textColor,
          }}
        >
          <tr>
            <th style={{ padding: thumbnail ? "4px" : "8px", textAlign: "left", width: "52%" }}>
              {lineItemsTable.descriptionLabel}
            </th>
            <th style={{ padding: thumbnail ? "4px" : "8px", textAlign: "center" }}>{lineItemsTable.quantityLabel}</th>
            <th style={{ padding: thumbnail ? "4px" : "8px", textAlign: "right" }}>{lineItemsTable.rateLabel}</th>
            <th style={{ padding: thumbnail ? "4px" : "8px", textAlign: "right" }}>{lineItemsTable.amountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {displayedItems.map((item, index) => (
            <tr
              key={item.id}
              style={{
                background: lineItemsTable.style === "striped" && index % 2 ? theme.backgroundColor : undefined,
                border: lineItemsTable.style === "bordered" ? `1px solid ${theme.borderColor}` : undefined,
                borderBottom: lineItemsTable.style === "minimal" ? undefined : `1px solid ${theme.borderColor}`,
              }}
            >
              <td
                style={{
                  overflowWrap: "anywhere",
                  padding: thumbnail ? "4px" : "9px 8px",
                  verticalAlign: "top",
                }}
              >
                <strong>
                  {lineItemsTable.showItemNumbers ? `${index + 1}. ` : ""}
                  {item.description}
                </strong>
                {item.taxable && lineItemsTable.showTaxableColumn && !thumbnail ? (
                  <small style={{ ...mutedStyle, display: "block" }}>Taxable</small>
                ) : null}
              </td>
              <td
                style={{
                  padding: thumbnail ? "4px" : "9px 8px",
                  textAlign: "center",
                  verticalAlign: "top",
                }}
              >
                {item.quantity}
              </td>
              <td
                style={{
                  padding: thumbnail ? "4px" : "9px 8px",
                  textAlign: "right",
                  verticalAlign: "top",
                }}
              >
                {currency(item.unitPrice)}
              </td>
              <td
                style={{
                  fontWeight: 700,
                  padding: thumbnail ? "4px" : "9px 8px",
                  textAlign: "right",
                  verticalAlign: "top",
                }}
              >
                {currency(item.quantity * item.unitPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  ) : null;

  const totalRows: Array<[boolean, string, ReactNode]> = [
    [totalsBlock.showSubtotal, labels.subtotal, currency(totals.subtotal)],
    [totalsBlock.showDiscount && totals.discountAmount > 0, labels.discount, `− ${currency(totals.discountAmount)}`],
    [totalsBlock.showTax && totals.taxAmount > 0, data.totalsConfig.taxLabel || labels.tax, currency(totals.taxAmount)],
    [totalsBlock.showShipping && totals.shippingFee > 0, labels.shipping, currency(totals.shippingFee)],
    [true, labels.total, currency(totals.total)],
    [totalsBlock.showAmountPaid && totals.amountPaid > 0, labels.amountPaid, `− ${currency(totals.amountPaid)}`],
  ];
  const totalsSection = visibility.showTotals ? (
    <section
      style={{
        display: "flex",
        justifyContent: totalsBlock.position === "full-width" ? "stretch" : "flex-end",
      }}
    >
      <div
        style={{
          ...(totalsBlock.style === "boxed" ? panelStyle : {}),
          maxWidth: totalsBlock.position === "full-width" ? undefined : thumbnail ? 150 : 280,
          padding: totalsBlock.style === "boxed" ? (thumbnail ? 6 : 10) : 0,
          width: "100%",
        }}
      >
        {totalRows.map(([show, label, value]) =>
          show ? (
            <div
              key={label}
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "space-between",
                padding: thumbnail ? "2px 0" : "4px 0",
              }}
            >
              <span style={mutedStyle}>{label}</span>
              <strong>{value}</strong>
            </div>
          ) : null,
        )}
        {totalsBlock.showBalanceDue ? (
          <div
            style={{
              background: totalsBlock.style === "highlight-total" ? theme.primaryColor : theme.backgroundColor,
              border: `1px solid ${theme.primaryColor}`,
              borderRadius: layoutFamily === "minimal" ? 2 : thumbnail ? 4 : 8,
              color: totalsBlock.style === "highlight-total" ? theme.surfaceColor : theme.textColor,
              display: "flex",
              fontSize: thumbnail ? "1em" : "1.08em",
              fontWeight: totalsBlock.emphasizeBalanceDue ? 900 : 700,
              gap: 12,
              justifyContent: "space-between",
              marginTop: thumbnail ? 3 : 6,
              padding: thumbnail ? "4px 6px" : "9px 11px",
            }}
          >
            <span>{labels.balanceDue}</span>
            <span>{currency(totals.balanceDue)}</span>
          </div>
        ) : null}
      </div>
    </section>
  ) : null;

  const paymentSection =
    visibility.showPaymentInstructions && paymentBlock.showInstructions && data.payment.instructions ? (
      <section
        style={{
          ...(paymentBlock.style === "boxed" ? panelStyle : {}),
          background: paymentBlock.style === "muted" ? theme.backgroundColor : undefined,
          borderRadius: paymentBlock.style === "muted" ? (layoutFamily === "minimal" ? 2 : 8) : undefined,
          padding: paymentBlock.style === "plain" ? 0 : thumbnail ? 6 : 12,
        }}
      >
        <strong style={{ ...detailHeadingStyle, marginBottom: 4 }}>
          {paymentBlock.title || labels.paymentInstructions}
        </strong>
        <div
          style={{
            ...mutedStyle,
            fontSize: "0.84em",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          {thumbnail ? data.payment.instructions.slice(0, 76) : data.payment.instructions}
          {thumbnail && data.payment.instructions.length > 76 ? "…" : ""}
        </div>
        {paymentBlock.showPaymentMethods && data.payment.methods.length && !thumbnail ? (
          <div
            style={{
              ...mutedStyle,
              borderTop: `1px dashed ${theme.borderColor}`,
              fontSize: "0.78em",
              marginTop: 7,
              paddingTop: 7,
            }}
          >
            Accepted: {data.payment.methods.join(", ")}
          </div>
        ) : null}
        {paymentBlock.showLateFeeNote && data.payment.lateFeeNote && !thumbnail ? (
          <div style={{ color: theme.mutedTextColor, fontSize: "0.78em", marginTop: 7 }}>
            {data.payment.lateFeeNote}
          </div>
        ) : null}
      </section>
    ) : null;

  const notesSection =
    (visibility.showNotes && notesBlock.showNotes) ||
    (visibility.showTerms && notesBlock.showTerms) ||
    notesBlock.showThankYouNote ? (
      <section
        style={{
          display: "grid",
          gap: thumbnail ? 6 : 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}
      >
        {visibility.showNotes && notesBlock.showNotes && data.notes.notes ? (
          <div
            style={{
              ...(notesBlock.style === "boxed" ? panelStyle : {}),
              background: notesBlock.style === "muted" ? theme.backgroundColor : undefined,
              borderRadius: notesBlock.style === "muted" ? (layoutFamily === "minimal" ? 2 : 8) : undefined,
              padding: notesBlock.style === "plain" ? 0 : thumbnail ? 6 : 10,
            }}
          >
            <strong style={detailHeadingStyle}>{notesBlock.title || labels.notes}</strong>
            <div style={{ ...mutedStyle, fontSize: "0.82em", overflowWrap: "anywhere" }}>
              {thumbnail ? data.notes.notes.slice(0, 70) : data.notes.notes}
            </div>
          </div>
        ) : null}
        {visibility.showTerms && notesBlock.showTerms && data.notes.terms ? (
          <div
            style={{
              ...(notesBlock.style === "boxed" ? panelStyle : {}),
              background: notesBlock.style === "muted" ? theme.backgroundColor : undefined,
              borderRadius: notesBlock.style === "muted" ? (layoutFamily === "minimal" ? 2 : 8) : undefined,
              padding: notesBlock.style === "plain" ? 0 : thumbnail ? 6 : 10,
            }}
          >
            <strong style={detailHeadingStyle}>{labels.terms}</strong>
            <div style={{ ...mutedStyle, fontSize: "0.82em", overflowWrap: "anywhere" }}>
              {thumbnail ? data.notes.terms.slice(0, 70) : data.notes.terms}
            </div>
          </div>
        ) : null}
        {notesBlock.showThankYouNote && data.payment.thankYouNote && !thumbnail ? (
          <strong style={{ color: theme.primaryColor, gridColumn: "1 / -1", textAlign: "right" }}>
            {data.payment.thankYouNote}
          </strong>
        ) : null}
      </section>
    ) : null;

  const footerSection =
    visibility.showFooter && footer.showFooter ? (
      <footer
        style={{
          ...mutedStyle,
          borderTop: `1px solid ${theme.borderColor}`,
          fontSize: "0.78em",
          paddingTop: thumbnail ? 5 : 12,
          textAlign: footer.alignment,
        }}
      >
        {footer.text}
        {footer.showGeneratedWith && !thumbnail ? " · Generated with SmartTools" : ""}
      </footer>
    ) : null;

  const sections: Record<string, ReactNode> = {
    header: headerSection,
    meta_info: metaSection,
    line_items: lineItemsSection,
    totals: totalsSection,
    payment_instructions: paymentSection,
    notes_terms: notesSection,
    footer: footerSection,
  };
  const sectionOrder = config.sectionOrder.length ? config.sectionOrder : fallbackSectionOrder;
  const visibleOrder = thumbnail
    ? sectionOrder.filter((section) => ["header", "meta_info", "line_items", "totals"].includes(section))
    : sectionOrder;

  return (
    <article
      aria-label={`${template.name} invoice preview`}
      data-layout-family={layoutFamily}
      data-preview-variant={variant}
      style={{
        background: theme.surfaceColor,
        border: `${page.showPageBorder ? 2 : 1}px solid ${page.showPageBorder ? theme.primaryColor : theme.borderColor}`,
        borderRadius: layoutFamily === "minimal" ? 2 : thumbnail ? 7 : 12,
        boxShadow: thumbnail ? "none" : "0 10px 30px rgb(15 23 42 / 0.08)",
        color: theme.textColor,
        display: "flex",
        flexDirection: "column",
        fontFamily: typography.fontFamily,
        fontSize: thumbnail ? 7 : baseFontSize,
        gap: sectionGap,
        lineHeight: typography.lineHeight === "tight" ? 1.25 : typography.lineHeight === "relaxed" ? 1.7 : 1.5,
        minHeight: thumbnail ? 150 : 680,
        overflow: "hidden",
        padding: spacing,
        position: "relative",
      }}
    >
      {layoutFamily !== "minimal" && layoutFamily !== "bold" ? (
        <div
          aria-hidden="true"
          style={{
            background: theme.primaryColor,
            height: thumbnail ? 3 : 6,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
      ) : null}
      {watermark.enabled && !thumbnail ? (
        <div
          aria-hidden="true"
          style={{
            bottom: watermark.position === "bottom-right" ? 24 : undefined,
            color: theme.primaryColor,
            fontSize: watermark.position === "center" ? 58 : 22,
            fontWeight: 900,
            left: watermark.position === "center" ? "10%" : undefined,
            opacity: watermark.opacity,
            pointerEvents: "none",
            position: "absolute",
            right: watermark.position === "center" ? "10%" : 24,
            textAlign: "center",
            top: watermark.position === "center" ? "42%" : undefined,
            transform: watermark.position === "center" ? "rotate(-28deg)" : undefined,
            zIndex: 0,
          }}
        >
          {watermark.text}
        </div>
      ) : null}
      {visibleOrder.map((section) =>
        sections[section] ? (
          <div key={section} style={{ position: "relative", zIndex: 1 }}>
            {sections[section]}
          </div>
        ) : null,
      )}
    </article>
  );
}

export {
  invoicePreviewSampleOptions,
  invoicePreviewSamples,
  longTextInvoiceSample,
  manyLineItemsInvoiceSample,
  partialPaymentInvoiceSample,
  serviceInvoiceSample,
  simpleInvoiceSample,
} from "./previewData.ts";
export type { InvoicePreviewData, InvoicePreviewSampleId } from "./previewData.ts";
