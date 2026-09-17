import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceTemplate } from "@canopy/invoice-templates";
import type { ReactNode } from "react";
import type { CalculatedTotals, InvoiceData } from "@/lib/paperwork/types";
import { calculateInvoiceTotals, formatCurrency } from "@/lib/paperwork/utils/calculations";

export interface InvoicePdfDocumentProps {
  data: InvoiceData;
  template: InvoiceTemplate;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank: "Bank Wire",
  card: "Credit Card",
  cash: "Cash",
  check: "Business Check",
  paypal: "PayPal",
  venmo: "Venmo",
  zelle: "Zelle",
};

const styles = StyleSheet.create({
  page: {
    position: "relative",
    paddingBottom: 64,
  },
  pageBorder: {
    position: "absolute",
    inset: 12,
    borderWidth: 1,
  },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  watermark: {
    position: "absolute",
    zIndex: 0,
  },
  watermarkCenter: {
    top: "42%",
    left: "15%",
    right: "15%",
    textAlign: "center",
    transform: "rotate(-35deg)",
    fontSize: 64,
  },
  watermarkCorner: {
    right: 28,
    bottom: 54,
    fontSize: 20,
  },
  content: {
    zIndex: 1,
  },
  row: {
    flexDirection: "row",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  grow: {
    flexGrow: 1,
  },
  right: {
    textAlign: "right",
  },
  muted: {
    color: "#64748b",
  },
  bold: {
    fontWeight: 700,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  brand: {
    width: "58%",
  },
  meta: {
    width: "38%",
    textAlign: "right",
  },
  logo: {
    maxWidth: 150,
    objectFit: "contain",
    objectPosition: "left",
    marginBottom: 7,
  },
  businessName: {
    fontWeight: 700,
    marginBottom: 5,
  },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  status: {
    alignSelf: "flex-end",
    color: "#047857",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 7,
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 6,
  },
  detailLine: {
    marginTop: 2,
  },
  boldHeader: {
    color: "#ffffff",
    marginBottom: 16,
  },
  boldHeaderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff44",
  },
  boldHeaderBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  recipientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 18,
  },
  infoBlock: {
    width: "48%",
  },
  boxedInfo: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 6,
  },
  sectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 2,
  },
  projectItem: {
    marginBottom: 6,
  },
  table: {
    marginTop: 2,
    marginBottom: 18,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1.5,
    paddingVertical: 7,
    paddingHorizontal: 5,
  },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 0.5,
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  itemNumberColumn: {
    width: "6%",
  },
  descriptionColumn: {
    width: "46%",
    paddingRight: 8,
  },
  descriptionColumnWithNumber: {
    width: "40%",
    paddingRight: 8,
  },
  quantityColumn: {
    width: "12%",
    textAlign: "center",
  },
  rateColumn: {
    width: "18%",
    textAlign: "right",
  },
  amountColumn: {
    width: "24%",
    textAlign: "right",
  },
  itemDescription: {
    fontWeight: 700,
  },
  taxable: {
    alignSelf: "flex-start",
    marginTop: 3,
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderWidth: 0.5,
    borderRadius: 2,
    fontSize: 6,
  },
  emptyTable: {
    paddingVertical: 18,
    textAlign: "center",
    fontStyle: "italic",
  },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: 1,
  },
  payment: {
    width: "48%",
  },
  paymentBox: {
    padding: 9,
    borderWidth: 1,
    borderRadius: 5,
  },
  paymentMethods: {
    marginTop: 7,
    paddingTop: 6,
    borderTopWidth: 0.5,
    fontSize: 7,
  },
  totals: {
    width: "46%",
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 7,
    marginTop: 2,
    marginBottom: 6,
    fontWeight: 700,
  },
  balance: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 5,
    padding: 9,
    marginTop: 2,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: 700,
  },
  notes: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  notesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  noteColumn: {
    width: "48%",
  },
  noteBox: {
    padding: 8,
    borderWidth: 1,
    borderRadius: 4,
  },
  notices: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 9,
    marginTop: 9,
    borderTopWidth: 0.5,
  },
  lateFee: {
    width: "58%",
    color: "#dc2626",
    fontSize: 7,
  },
  thankYou: {
    width: "38%",
    textAlign: "right",
    fontStyle: "italic",
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 7,
    borderTopWidth: 0.5,
    fontSize: 6.5,
  },
  footerText: {
    width: "60%",
    textAlign: "center",
    fontStyle: "italic",
  },
  pageNumber: {
    width: "20%",
    textAlign: "right",
  },
});

function pdfFontFamily(fontFamily: string) {
  if (fontFamily === "Times-Roman" || fontFamily === "Georgia") {
    return "Times-Roman";
  }
  if (fontFamily === "Courier" || fontFamily === "JetBrains Mono") {
    return "Courier";
  }
  return "Helvetica";
}

function addressLines(details: {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}) {
  const locality = [details.city, details.state].filter(Boolean).join(", ");
  return [
    details.addressLine1,
    details.addressLine2,
    [locality, details.zipCode].filter(Boolean).join(" "),
    details.country,
  ].filter(Boolean);
}

function paymentMethods(methods: readonly string[]) {
  return methods.map((method) => PAYMENT_METHOD_LABELS[method] ?? method).join(", ");
}

function DetailLine({ children }: { children: ReactNode }) {
  return <Text style={styles.detailLine}>{children}</Text>;
}

function TotalLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.totalLine}>
      <Text style={color ? { color } : undefined}>{label}</Text>
      <Text style={[styles.bold, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function InvoiceTotals({ data, template, totals }: InvoicePdfDocumentProps & { totals: CalculatedTotals }) {
  const { labels, theme, totalsBlock } = template.config;
  const currency = data.invoice.currency || "USD";
  const highlighted = totalsBlock.style === "highlight-total";

  return (
    <View style={styles.totals} wrap={false}>
      {totalsBlock.showSubtotal ? (
        <TotalLine label={labels.subtotal || "Subtotal"} value={formatCurrency(totals.subtotal, currency)} />
      ) : null}
      {totalsBlock.showDiscount && totals.discountAmount > 0 ? (
        <TotalLine
          color="#059669"
          label={`${labels.discount || "Discount"}${
            data.totalsConfig.discountType === "percent" ? ` (${data.totalsConfig.discountValue}%)` : ""
          }`}
          value={`- ${formatCurrency(totals.discountAmount, currency)}`}
        />
      ) : null}
      {totalsBlock.showTax && totals.taxAmount > 0 ? (
        <TotalLine
          label={`${data.totalsConfig.taxLabel || labels.tax || "Sales Tax"} (${data.totalsConfig.taxRate}%)`}
          value={formatCurrency(totals.taxAmount, currency)}
        />
      ) : null}
      {totalsBlock.showShipping && totals.shippingFee > 0 ? (
        <TotalLine label={labels.shipping || "Shipping"} value={formatCurrency(totals.shippingFee, currency)} />
      ) : null}
      <View style={[styles.grandTotal, { borderColor: theme.borderColor }]}>
        <Text>{labels.total || "Total Due"}</Text>
        <Text>{formatCurrency(totals.total, currency)}</Text>
      </View>
      {totalsBlock.showAmountPaid && totals.amountPaid > 0 ? (
        <TotalLine
          label={labels.amountPaid || "Amount Paid"}
          value={`- ${formatCurrency(totals.amountPaid, currency)}`}
        />
      ) : null}
      {totalsBlock.showBalanceDue ? (
        <View
          style={[
            styles.balance,
            highlighted
              ? {
                  backgroundColor: theme.primaryColor,
                  borderColor: theme.primaryColor,
                  color: theme.surfaceColor,
                }
              : {
                  backgroundColor: theme.backgroundColor,
                  borderColor: theme.primaryColor,
                  color: theme.textColor,
                },
          ]}
        >
          <Text style={styles.bold}>{labels.balanceDue || "Balance Due"}</Text>
          <Text style={[styles.balanceAmount, { color: highlighted ? theme.surfaceColor : theme.primaryColor }]}>
            {formatCurrency(totals.balanceDue, currency)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function InvoicePdfDocument({ data, template }: InvoicePdfDocumentProps) {
  const totals = calculateInvoiceTotals(data);
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
    pdf,
    theme,
    totalsBlock,
    typography,
    visibility,
    watermark,
  } = config;
  const margin = page.margin === "compact" ? 28 : page.margin === "spacious" ? 52 : 38;
  const bodySize = typography.bodySize === "xs" ? 8 : typography.bodySize === "md" ? 11 : 9;
  const headingSize =
    typography.headingSize === "sm"
      ? 16
      : typography.headingSize === "lg"
        ? 24
        : typography.headingSize === "xl"
          ? 28
          : 20;
  const title = header.invoiceTitleText || labels.invoiceTitle || "INVOICE";
  const currency = data.invoice.currency || "USD";
  const businessAddress = addressLines(data.business);
  const clientAddress = addressLines(data.client);
  const acceptedMethods = paymentMethods(data.payment.methods ?? []);
  const showProject = visibility.showMetaBlock && metaBlock.showProjectName && data.invoice.projectName;
  const showPo = visibility.showMetaBlock && metaBlock.showPoNumber && data.invoice.poNumber;
  const showNotes = visibility.showNotes && notesBlock.showNotes && data.notes.notes;
  const showTerms = visibility.showTerms && notesBlock.showTerms && data.notes.terms;
  const logoHeight = header.logoSize === "xs" ? 24 : header.logoSize === "sm" ? 32 : header.logoSize === "lg" ? 52 : 42;

  return (
    <Document
      author={data.business.name || "SmartTools Paperwork"}
      creator="SmartTools Paperwork"
      language="en-US"
      subject={`Invoice ${data.invoice.invoiceNumber || "draft"}`}
      title={`${title} ${data.invoice.invoiceNumber || "draft"}`}
    >
      <Page
        orientation={pdf.orientation}
        size={pdf.pageSize || page.size}
        style={[
          styles.page,
          {
            backgroundColor: theme.surfaceColor,
            color: theme.textColor,
            fontFamily: pdfFontFamily(typography.fontFamily),
            fontSize: bodySize,
            paddingTop: margin,
            paddingHorizontal: margin,
          },
        ]}
        wrap
      >
        {page.showPageBorder ? <View fixed style={[styles.pageBorder, { borderColor: theme.primaryColor }]} /> : null}
        {layoutFamily !== "minimal" ? (
          <View fixed style={[styles.topAccent, { backgroundColor: theme.primaryColor }]} />
        ) : null}
        {watermark.enabled ? (
          <Text
            fixed
            style={[
              styles.watermark,
              watermark.position === "center" ? styles.watermarkCenter : styles.watermarkCorner,
              { color: theme.primaryColor, opacity: watermark.opacity },
            ]}
          >
            {watermark.text}
          </Text>
        ) : null}

        <View style={styles.content}>
          {layoutFamily === "bold" ? (
            <View
              style={[
                styles.boldHeader,
                {
                  backgroundColor: theme.primaryColor,
                  marginTop: -margin,
                  marginHorizontal: -margin,
                  padding: margin,
                },
              ]}
              wrap={false}
            >
              <View style={styles.boldHeaderTop}>
                {visibility.showLogo && data.business.logo ? (
                  <Image src={data.business.logo} style={[styles.logo, { height: logoHeight, marginBottom: 0 }]} />
                ) : (
                  <Text style={[styles.bold, { fontSize: 14 }]}>{data.business.name || "Business Name"}</Text>
                )}
                {header.showInvoiceTitle ? <Text style={[styles.bold, { fontSize: headingSize }]}>{title}</Text> : null}
              </View>
              <View style={styles.boldHeaderBottom}>
                {visibility.showBusinessBlock ? (
                  <View style={styles.infoBlock}>
                    <Text style={styles.sectionLabel}>{labels.from || "Issuer"}</Text>
                    {businessBlock.showBusinessName ? (
                      <Text style={styles.infoName}>{data.business.name || "Business Name"}</Text>
                    ) : null}
                    {businessBlock.showContactName && data.business.contactName ? (
                      <DetailLine>{data.business.contactName}</DetailLine>
                    ) : null}
                    {businessBlock.showEmail && data.business.email ? (
                      <DetailLine>{data.business.email}</DetailLine>
                    ) : null}
                  </View>
                ) : null}
                {visibility.showMetaBlock ? (
                  <View style={[styles.infoBlock, styles.right]}>
                    {metaBlock.showInvoiceNumber ? (
                      <Text style={styles.infoName}>#{data.invoice.invoiceNumber || "INV-1"}</Text>
                    ) : null}
                    {metaBlock.showInvoiceDate && data.invoice.invoiceDate ? (
                      <DetailLine>
                        {labels.invoiceDate}: {data.invoice.invoiceDate}
                      </DetailLine>
                    ) : null}
                    {metaBlock.showDueDate && data.invoice.dueDate ? (
                      <DetailLine>
                        {labels.dueDate}: {data.invoice.dueDate}
                      </DetailLine>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[styles.header, { borderColor: theme.borderColor }]} wrap={false}>
              {visibility.showBusinessBlock ? (
                <View style={styles.brand}>
                  {visibility.showLogo && data.business.logo ? (
                    <Image src={data.business.logo} style={[styles.logo, { height: logoHeight }]} />
                  ) : null}
                  {businessBlock.showBusinessName ? (
                    <Text style={[styles.businessName, { color: theme.primaryColor, fontSize: headingSize }]}>
                      {data.business.name || "Business Name"}
                    </Text>
                  ) : null}
                  {layoutFamily !== "compact" ? (
                    <View style={{ color: theme.mutedTextColor }}>
                      {businessBlock.showContactName && data.business.contactName ? (
                        <DetailLine>{data.business.contactName}</DetailLine>
                      ) : null}
                      {businessBlock.showAddress
                        ? businessAddress.map((line) => <DetailLine key={line}>{line}</DetailLine>)
                        : null}
                      {businessBlock.showEmail && data.business.email ? (
                        <DetailLine>{data.business.email}</DetailLine>
                      ) : null}
                      {businessBlock.showPhone && data.business.phone ? (
                        <DetailLine>{data.business.phone}</DetailLine>
                      ) : null}
                      {businessBlock.showWebsite && data.business.website ? (
                        <DetailLine>{data.business.website}</DetailLine>
                      ) : null}
                      {businessBlock.showTaxId && data.business.taxId ? (
                        <DetailLine>Tax ID: {data.business.taxId}</DetailLine>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View />
              )}
              {visibility.showMetaBlock || header.showInvoiceTitle ? (
                <View style={styles.meta}>
                  {header.showInvoiceTitle ? (
                    <Text style={[styles.invoiceTitle, { color: theme.primaryColor }]}>{title}</Text>
                  ) : null}
                  {header.showStatusBadge ? <Text style={styles.status}>Saved</Text> : null}
                  {visibility.showMetaBlock && metaBlock.showInvoiceNumber ? (
                    <Text style={[styles.infoName, styles.right]}>#{data.invoice.invoiceNumber || "INV-YYYY-001"}</Text>
                  ) : null}
                  {visibility.showMetaBlock && metaBlock.showInvoiceDate && data.invoice.invoiceDate ? (
                    <DetailLine>
                      {labels.invoiceDate}: {data.invoice.invoiceDate}
                    </DetailLine>
                  ) : null}
                  {visibility.showMetaBlock && metaBlock.showDueDate && data.invoice.dueDate ? (
                    <DetailLine>
                      {labels.dueDate}: {data.invoice.dueDate}
                    </DetailLine>
                  ) : null}
                  {visibility.showMetaBlock && metaBlock.showPaymentTerms && data.invoice.paymentTerms ? (
                    <DetailLine>
                      {labels.paymentTerms}: {data.invoice.paymentTerms}
                    </DetailLine>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {visibility.showClientBlock || showProject || showPo || layoutFamily === "compact" ? (
            <View style={styles.recipientRow} wrap={false}>
              {visibility.showClientBlock ? (
                <View
                  style={[
                    styles.infoBlock,
                    ...(layoutFamily === "modern" || layoutFamily === "service" || layoutFamily === "bold"
                      ? [
                          styles.boxedInfo,
                          {
                            backgroundColor: theme.backgroundColor,
                            borderColor: theme.borderColor,
                          },
                        ]
                      : []),
                    ...(layoutFamily === "classic"
                      ? [
                          {
                            borderLeftWidth: 3,
                            borderLeftColor: theme.primaryColor,
                            paddingLeft: 9,
                          },
                        ]
                      : []),
                  ]}
                >
                  <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                    {clientBlock.title || labels.billTo || "Billed To"}
                  </Text>
                  {clientBlock.showClientName ? (
                    <Text style={styles.infoName}>{data.client.name || "Client Name"}</Text>
                  ) : null}
                  {clientBlock.showCompany && data.client.company ? (
                    <DetailLine>{data.client.company}</DetailLine>
                  ) : null}
                  {clientBlock.showAddress
                    ? clientAddress.map((line) => <DetailLine key={line}>{line}</DetailLine>)
                    : null}
                  {clientBlock.showEmail && data.client.email ? <DetailLine>{data.client.email}</DetailLine> : null}
                  {clientBlock.showPhone && data.client.phone ? <DetailLine>{data.client.phone}</DetailLine> : null}
                </View>
              ) : (
                <View style={styles.infoBlock} />
              )}

              {showProject || showPo || layoutFamily === "compact" ? (
                <View
                  style={[
                    styles.infoBlock,
                    styles.boxedInfo,
                    { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor },
                  ]}
                >
                  {layoutFamily === "compact" && visibility.showBusinessBlock ? (
                    <View style={styles.projectItem}>
                      <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                        {labels.from || "Seller Details"}
                      </Text>
                      <Text style={styles.infoName}>{data.business.name || "Business Name"}</Text>
                      {businessBlock.showEmail && data.business.email ? (
                        <DetailLine>{data.business.email}</DetailLine>
                      ) : null}
                      {businessBlock.showPhone && data.business.phone ? (
                        <DetailLine>{data.business.phone}</DetailLine>
                      ) : null}
                    </View>
                  ) : null}
                  {showProject ? (
                    <View style={styles.projectItem}>
                      <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                        {labels.projectName || "Project"}
                      </Text>
                      <Text style={styles.bold}>{data.invoice.projectName}</Text>
                    </View>
                  ) : null}
                  {showPo ? (
                    <View>
                      <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                        {labels.poNumber || "P.O. Number"}
                      </Text>
                      <Text style={styles.bold}>{data.invoice.poNumber}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {visibility.showLineItems ? (
            <View style={styles.table}>
              <View
                fixed={pdf.repeatTableHeader}
                style={[
                  styles.tableHeader,
                  lineItemsTable.headerBackground
                    ? {
                        backgroundColor: theme.primaryColor,
                        borderColor: theme.primaryColor,
                        color: theme.surfaceColor,
                      }
                    : { borderColor: theme.borderColor, color: theme.mutedTextColor },
                ]}
              >
                {lineItemsTable.showItemNumbers ? (
                  <Text style={[styles.tableHeaderText, styles.itemNumberColumn]}>#</Text>
                ) : null}
                <Text
                  style={[
                    styles.tableHeaderText,
                    lineItemsTable.showItemNumbers ? styles.descriptionColumnWithNumber : styles.descriptionColumn,
                  ]}
                >
                  {lineItemsTable.descriptionLabel || "Description"}
                </Text>
                <Text style={[styles.tableHeaderText, styles.quantityColumn]}>
                  {lineItemsTable.quantityLabel || "Qty"}
                </Text>
                <Text style={[styles.tableHeaderText, styles.rateColumn]}>{lineItemsTable.rateLabel || "Rate"}</Text>
                <Text style={[styles.tableHeaderText, styles.amountColumn]}>
                  {lineItemsTable.amountLabel || "Amount"}
                </Text>
              </View>
              {data.lineItems.length ? (
                data.lineItems.map((item, index) => {
                  const quantity = Number(item.quantity) || 0;
                  const rate = Number(item.unitPrice) || 0;
                  return (
                    <View
                      key={item.id || index}
                      style={[
                        styles.tableRow,
                        {
                          backgroundColor:
                            lineItemsTable.style === "striped" && index % 2 === 1
                              ? theme.backgroundColor
                              : theme.surfaceColor,
                          borderColor: theme.borderColor,
                          borderLeftWidth: lineItemsTable.style === "bordered" ? 0.5 : 0,
                          borderRightWidth: lineItemsTable.style === "bordered" ? 0.5 : 0,
                        },
                      ]}
                      wrap={!pdf.avoidRowSplit}
                    >
                      {lineItemsTable.showItemNumbers ? <Text style={styles.itemNumberColumn}>{index + 1}</Text> : null}
                      <View
                        style={
                          lineItemsTable.showItemNumbers ? styles.descriptionColumnWithNumber : styles.descriptionColumn
                        }
                      >
                        <Text style={styles.itemDescription}>{item.description || "Deliverable item"}</Text>
                        {item.taxable && lineItemsTable.showTaxableColumn ? (
                          <Text
                            style={[
                              styles.taxable,
                              {
                                backgroundColor: theme.backgroundColor,
                                borderColor: theme.borderColor,
                                color: theme.mutedTextColor,
                              },
                            ]}
                          >
                            Taxable
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.quantityColumn}>{quantity}</Text>
                      <Text style={styles.rateColumn}>{formatCurrency(rate, currency)}</Text>
                      <Text style={[styles.amountColumn, styles.bold]}>
                        {formatCurrency(quantity * rate, currency)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={[styles.emptyTable, { color: theme.mutedTextColor }]}>
                  Add items in the editor to preview invoice totals.
                </Text>
              )}
            </View>
          ) : null}

          {visibility.showTotals ? (
            <View style={[styles.summary, { borderColor: theme.borderColor }]}>
              <View style={styles.payment} wrap={false}>
                {visibility.showPaymentInstructions && data.payment.instructions ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                      {paymentBlock.title || labels.paymentInstructions || "Payment Instructions"}
                    </Text>
                    <View
                      style={[
                        styles.paymentBox,
                        {
                          backgroundColor: paymentBlock.style === "muted" ? theme.backgroundColor : theme.surfaceColor,
                          borderColor: theme.borderColor,
                        },
                      ]}
                    >
                      <Text>{data.payment.instructions}</Text>
                      {paymentBlock.showPaymentMethods && acceptedMethods ? (
                        <Text
                          style={[
                            styles.paymentMethods,
                            { borderColor: theme.borderColor, color: theme.mutedTextColor },
                          ]}
                        >
                          Methods accepted: {acceptedMethods}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
              <InvoiceTotals data={data} template={template} totals={totals} />
            </View>
          ) : null}

          {showNotes || showTerms || data.payment.lateFeeNote || data.payment.thankYouNote ? (
            <View style={[styles.notes, { borderColor: theme.borderColor }]}>
              {showNotes || showTerms ? (
                <View style={styles.notesRow}>
                  {showNotes ? (
                    <View style={styles.noteColumn} wrap={false}>
                      <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                        {notesBlock.title || labels.notes || "Notes"}
                      </Text>
                      <Text
                        style={[
                          styles.noteBox,
                          {
                            backgroundColor: notesBlock.style === "muted" ? theme.backgroundColor : theme.surfaceColor,
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        {data.notes.notes}
                      </Text>
                    </View>
                  ) : null}
                  {showTerms ? (
                    <View style={styles.noteColumn} wrap={false}>
                      <Text style={[styles.sectionLabel, { color: theme.mutedTextColor }]}>
                        {labels.terms || "Terms"}
                      </Text>
                      <Text
                        style={[
                          styles.noteBox,
                          {
                            backgroundColor: notesBlock.style === "muted" ? theme.backgroundColor : theme.surfaceColor,
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        {data.notes.terms}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {(paymentBlock.showLateFeeNote && data.payment.lateFeeNote) ||
              (notesBlock.showThankYouNote && data.payment.thankYouNote) ? (
                <View style={[styles.notices, { borderColor: theme.borderColor }]}>
                  <Text style={styles.lateFee}>
                    {paymentBlock.showLateFeeNote && data.payment.lateFeeNote
                      ? `Late fee notice: ${data.payment.lateFeeNote}`
                      : ""}
                  </Text>
                  <Text style={styles.thankYou}>{notesBlock.showThankYouNote ? data.payment.thankYouNote : ""}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {(visibility.showFooter && footer.showFooter) || pdf.showPageNumbers ? (
          <View fixed style={[styles.footer, { borderColor: theme.borderColor, color: theme.mutedTextColor }]}>
            <Text style={{ width: "20%" }}>{footer.showGeneratedWith ? "SmartTools Paperwork" : ""}</Text>
            <Text style={styles.footerText}>{visibility.showFooter && footer.showFooter ? footer.text : ""}</Text>
            {pdf.showPageNumbers ? (
              <Text
                render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                style={styles.pageNumber}
              />
            ) : (
              <Text style={styles.pageNumber} />
            )}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
