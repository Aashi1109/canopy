export interface InvoicePreviewData {
  business: {
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
    logo: string;
    taxId: string;
  };
  client: {
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
  };
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    paymentTerms: string;
    currency: string;
    poNumber: string;
    projectName: string;
  };
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxable: boolean;
  }>;
  totalsConfig: {
    discountType: "none" | "percent" | "fixed";
    discountValue: number;
    taxLabel: string;
    taxRate: number;
    shippingFee: number;
    amountPaid: number;
  };
  payment: {
    methods: string[];
    instructions: string;
    lateFeeNote: string;
    thankYouNote: string;
  };
  notes: {
    notes: string;
    terms: string;
  };
  template: string;
}

export type InvoicePreviewSampleId = "simple" | "service" | "many" | "partial" | "long";

export const invoicePreviewSampleOptions: ReadonlyArray<{
  label: string;
  value: InvoicePreviewSampleId;
}> = [
  { value: "simple", label: "Simple consulting fee (1 Row)" },
  { value: "service", label: "Standard maintenance run" },
  { value: "many", label: "Load stress-test items (8 Rows)" },
  { value: "partial", label: "Pre-deposit partial bills" },
  { value: "long", label: "Long names overflow stresses" },
];

export const simpleInvoiceSample: InvoicePreviewData = {
  business: {
    name: "Independent Consultants Corp",
    contactName: "Alex Vance",
    email: "billing@alexvance.io",
    phone: "(312) 555-0101",
    website: "alexvance.io",
    addressLine1: "111 W Jackson Blvd",
    addressLine2: "",
    city: "Chicago",
    state: "IL",
    zipCode: "60604",
    country: "United States",
    logo: "https://images.unsplash.com/photo-1549923746-c502d488b3ea?w=150&auto=format&fit=crop&q=60",
    taxId: "EIN-88-292911",
  },
  client: {
    name: "Horizon Venture Partners",
    company: "Horizon Capital",
    email: "accounting@horizonvp.com",
    phone: "(212) 555-8833",
    addressLine1: "150 Broadway",
    addressLine2: "Ste 45",
    city: "New York",
    state: "NY",
    zipCode: "10038",
    country: "United States",
  },
  invoice: {
    invoiceNumber: "INV-2026-001",
    invoiceDate: "2026-05-01",
    dueDate: "2026-05-15",
    paymentTerms: "Net 15",
    currency: "USD",
    poNumber: "",
    projectName: "Strategy Session Support",
  },
  lineItems: [
    {
      id: "it-1",
      description: "Q2 Advisory Consultation block",
      quantity: 1,
      unitPrice: 1500,
      taxable: false,
    },
  ],
  totalsConfig: {
    discountType: "none",
    discountValue: 0,
    taxLabel: "State Tax",
    taxRate: 0,
    shippingFee: 0,
    amountPaid: 0,
  },
  payment: {
    methods: ["bank"],
    instructions: "Wire transfer details: routing 021000021, account 123456789.",
    lateFeeNote: "Late fees of 1.5% apply after 15 days.",
    thankYouNote: "Thank you for partnering with us!",
  },
  notes: {
    notes: "Advisory sessions delivered remotely.",
    terms: "Payment is required via direct wire.",
  },
  template: "classic",
};

export const serviceInvoiceSample: InvoicePreviewData = {
  ...simpleInvoiceSample,
  business: {
    ...simpleInvoiceSample.business,
    name: "Blue Ridge Web Studio",
  },
  invoice: {
    ...simpleInvoiceSample.invoice,
    invoiceNumber: "INV-2026-104",
    projectName: "E-Commerce Upgrade",
    poNumber: "PO-33292",
  },
  lineItems: [
    {
      id: "it-s1",
      description: "React Frontend Refactoring (Bespoke Dashboard)",
      quantity: 12,
      unitPrice: 125,
      taxable: false,
    },
    {
      id: "it-s2",
      description: "Automated Cypress Integration testing runs",
      quantity: 4,
      unitPrice: 90,
      taxable: true,
    },
  ],
  totalsConfig: {
    discountType: "percent",
    discountValue: 5,
    taxLabel: "Local Tax",
    taxRate: 6.25,
    shippingFee: 0,
    amountPaid: 0,
  },
};

export const manyLineItemsInvoiceSample: InvoicePreviewData = {
  ...simpleInvoiceSample,
  invoice: {
    ...simpleInvoiceSample.invoice,
    invoiceNumber: "INV-LOAD-992",
  },
  lineItems: [
    {
      id: "row-1",
      description: "Design System Tokens",
      quantity: 1,
      unitPrice: 400,
      taxable: false,
    },
    {
      id: "row-2",
      description: "Vite Bundler Optimizations",
      quantity: 6,
      unitPrice: 150,
      taxable: false,
    },
    {
      id: "row-3",
      description: "Prisma Schema migrations",
      quantity: 2,
      unitPrice: 120,
      taxable: false,
    },
    {
      id: "row-4",
      description: "Express route sanitization middleware",
      quantity: 8,
      unitPrice: 100,
      taxable: false,
    },
    {
      id: "row-5",
      description: "User session cookie audits",
      quantity: 2,
      unitPrice: 150,
      taxable: false,
    },
    {
      id: "row-6",
      description: "SSL Certificate configurations",
      quantity: 1,
      unitPrice: 80,
      taxable: false,
    },
    {
      id: "row-7",
      description: "PostgreSQL Database tuning",
      quantity: 4,
      unitPrice: 180,
      taxable: false,
    },
    {
      id: "row-8",
      description: "QA regression run with mock users",
      quantity: 10,
      unitPrice: 75,
      taxable: false,
    },
  ],
  totalsConfig: {
    discountType: "fixed",
    discountValue: 150,
    taxLabel: "State Tax",
    taxRate: 5.5,
    shippingFee: 35,
    amountPaid: 1000,
  },
};

export const partialPaymentInvoiceSample: InvoicePreviewData = {
  ...simpleInvoiceSample,
  invoice: {
    ...simpleInvoiceSample.invoice,
    invoiceNumber: "INV-PAR-302",
  },
  lineItems: [
    {
      id: "r-1",
      description: "Product Photography Sprint",
      quantity: 1,
      unitPrice: 2400,
      taxable: false,
    },
  ],
  totalsConfig: {
    discountType: "none",
    discountValue: 0,
    taxLabel: "Service VAT",
    taxRate: 7,
    shippingFee: 0,
    amountPaid: 1800,
  },
};

export const longTextInvoiceSample: InvoicePreviewData = {
  business: {
    name: "Pacific Rim Architectural Foundations & Structured Construction Materials Global Logistics Firm LLC",
    contactName: "Balthazar Montgomery-Hamilton III",
    email: "accounting-and-receivables-group@pacificrimarchitecturalstructures.com",
    phone: "+1 (800) 555-0199 ext 302, support group lines open Monday through Friday 8am to 6pm PST",
    website: "pacificrimarchitecturalstructuresandgloballogistics.com",
    addressLine1: "1000 Waterfront Terminal Industrial Shipping Parkway",
    addressLine2: "Suite 450A, Building C, East Wing Terminal Annex",
    city: "Seattle-Tacoma Metropolises Annex",
    state: "WA",
    zipCode: "98101",
    country: "United States of America Regional Pacific Rim Trading Zone 4",
    logo: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60",
    taxId: "EIN-88-992211422919-WA",
  },
  client: {
    name: "Metropolitan Civic Infrastructure Developments & Municipal Underground Rail System Advisory Committee",
    company: "City Planning Commision Task Force Unit & Metropolitan Transit Authority Advisory Group Company Inc",
    email: "receiving-and-accounts-payable@metropolitancivicinfrastructuredevelopments.gov",
    phone: "+1 (206) 555-9000 ext 4591",
    addressLine1: "Municipal Services Plaza, 550 Fifth Avenue West, Underground Transit Level B, Suite 10",
    addressLine2: "c/o Department of Public Transportation & Finance Oversight Special Task Committee",
    city: "Seattle Transit District Area",
    state: "WA",
    zipCode: "98104",
    country: "United States of America",
  },
  invoice: {
    invoiceNumber: "INV-PAC-2026-STRESS-TEST-LARGE-SERIAL-10928731",
    invoiceDate: "2026-05-27",
    dueDate: "2026-08-25",
    paymentTerms: "Special net ninety days terms agreement with municipal agencies",
    currency: "USD",
    poNumber: "PO-MUN-SEA-TACTICAL-INFRASTRUCTURE-Q2-2026-09218274A",
    projectName: "Tacoma Underground Tunneling Excavation Phase 3 Core Support Deliverable Milestones",
  },
  lineItems: [
    {
      id: "l-s1",
      description:
        "Sub-surface tectonic analysis and seismic vibrations dampening simulation reporting. Deliverables include twelve copies of physical report bound in heavy leather and virtual 3D rendering delivered on high capacity flash storage with cryptographic verification hashes signed on site.",
      quantity: 1,
      unitPrice: 18500,
      taxable: true,
    },
    {
      id: "l-s2",
      description:
        "Hydro-geological drilling samples core analysis. Drilled core samples extracted from the Northwest segment between milestones 104 and 108. Includes testing for arsenic, lead, and chemical runoffs under deep core pressure levels.",
      quantity: 140,
      unitPrice: 150,
      taxable: true,
    },
  ],
  totalsConfig: {
    discountType: "percent",
    discountValue: 12.5,
    taxLabel: "Washington Municipal Environmental Excavation Levy Tax Rate",
    taxRate: 9.8,
    shippingFee: 450,
    amountPaid: 10000,
  },
  payment: {
    methods: ["bank"],
    instructions:
      "Wire transfers are to be routed exclusively using ACH Federal Reserve Core System. Routing Code: US-FED-981273. Receiving Transit Institution: Federal Commerce and Trust of the Northwest. Account: 99182736152. Reference mandatory: SEATTLE-TUNNEL-PHASE-3. Please confirm with our Chief Financial Officer after sending the wire notification copy.",
    lateFeeNote: "Late payments trigger an administrative investigation and interest under state code Chapter 12.",
    thankYouNote: "We look forward to Phase 4 underground logistics execution next winter!",
  },
  notes: {
    notes:
      "Environmental clearances have been pre-approved under code Seattle-Geo-2026. Drilling is monitored by certified structural engineers.",
    terms:
      "Payment must be received within 90 days. Disputes must be filed within fifteen days of receiving this statement.",
  },
  template: "classic",
};

export const invoicePreviewSamples: Record<InvoicePreviewSampleId, InvoicePreviewData> = {
  simple: simpleInvoiceSample,
  service: serviceInvoiceSample,
  many: manyLineItemsInvoiceSample,
  partial: partialPaymentInvoiceSample,
  long: longTextInvoiceSample,
};

export function calculateInvoicePreviewTotals(data: InvoicePreviewData) {
  const subtotal = data.lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const rawDiscount =
    data.totalsConfig.discountType === "percent"
      ? subtotal * ((Number(data.totalsConfig.discountValue) || 0) / 100)
      : data.totalsConfig.discountType === "fixed"
        ? Number(data.totalsConfig.discountValue) || 0
        : 0;
  const discountAmount = Math.min(subtotal, rawDiscount);
  const discountRatio = subtotal ? discountAmount / subtotal : 0;
  const taxableSubtotal = data.lineItems.reduce((sum, item) => {
    if (!item.taxable) return sum;
    const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    return sum + amount * (1 - discountRatio);
  }, 0);
  const taxAmount = taxableSubtotal * ((Number(data.totalsConfig.taxRate) || 0) / 100);
  const shippingFee = Number(data.totalsConfig.shippingFee) || 0;
  const total = Math.max(0, subtotal - discountAmount + taxAmount + shippingFee);
  const amountPaid = Number(data.totalsConfig.amountPaid) || 0;

  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingFee,
    total,
    amountPaid,
    balanceDue: Math.max(0, total - amountPaid),
  };
}

export function formatInvoicePreviewCurrency(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `$${(Number(amount) || 0).toFixed(2)}`;
  }
}
