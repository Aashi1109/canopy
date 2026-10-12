// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import ReceiptGeneratorPage from "../app/paperwork/components/receipt/ReceiptGeneratorPage.tsx";
import ExpenseReportPage from "../app/paperwork/components/expense/ExpenseReportPage.tsx";
import MileageLogPage, { DEFAULT_MILEAGE_DRAFT } from "../app/paperwork/components/mileage/MileageLogPage.tsx";
import QuarterlyTaxEstimatorPage from "../app/paperwork/components/tax/QuarterlyTaxEstimatorPage.tsx";
import W9RequestPage, {
  DEFAULT_W9_REQUEST_DRAFT,
  SAMPLE_W9_REQUEST_DRAFT,
} from "../app/paperwork/components/w9/W9RequestPage.tsx";
import NecTrackerPage, { DEFAULT_NEC_TRACKER_DRAFT } from "../app/paperwork/components/nec1099/NecTrackerPage.tsx";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import { getPaperworkToolMessages } from "../lib/paperwork/toolMessages.ts";
import { toolMessageTree } from "../lib/tool-framework/translations.ts";
import { DataBridge, DataBridgeKeys, LocalStorageProvider } from "../lib/paperwork/shared/dataBridge.ts";
import { DEFAULT_QUARTERLY_TAX_DRAFT } from "../lib/paperwork/quarterlyTaxRules.ts";
import { createW9Request, W9_REQUEST_DISCLAIMER } from "../lib/paperwork/contractorTaxRules.ts";
import AdvancedTemplateWorkspace from "../app/paperwork/components/AdvancedTemplateWorkspace.tsx";
import { GlobalToolSearchProvider } from "../components/ui/components/GlobalToolSearch.tsx";
import RelatedTools from "../app/paperwork/components/RelatedTools.tsx";
import { downloadAdvancedDocumentPdf } from "../app/paperwork/components/AdvancedDocumentPreview.tsx";
import { receiptAdapter } from "../lib/paperwork/documentAdapters.ts";
import { createAdvancedTemplateConfig, seedTemplates } from "../lib/invoice-templates/index.ts";
import { button, click, field, fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

// The default bridge starts a background sync at import time. Form persistence
// below uses the real local-storage provider, with no database or network.
vi.hoisted(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false })));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/paperwork/receipt-generator",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ locale: "en" }),
}));

// PDF layout/serialization has its own suites. Keep the workspace, validation,
// authored template fields, and adapter output real at this export boundary.
vi.mock("../app/paperwork/components/AdvancedDocumentPreview.tsx", () => ({
  AdvancedDocumentPreview: () => null,
  downloadAdvancedDocumentPdf: vi.fn().mockResolvedValue(undefined),
  openAdvancedDocumentPdf: vi.fn().mockResolvedValue(undefined),
}));

setupReactTools();

const originalProvider = DataBridge.getProvider();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
let intlErrors;

beforeEach(() => {
  localStorage.clear();
  DataBridge.setProvider(new LocalStorageProvider());
  vi.spyOn(window, "alert").mockImplementation(() => {});
  intlErrors = vi.fn();
  vi.mocked(downloadAdvancedDocumentPdf).mockClear();
});

afterEach(() => {
  DataBridge.setProvider(originalProvider);
  localStorage.clear();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete navigator.clipboard;
  expect(intlErrors).not.toHaveBeenCalled();
});

async function mountPaperwork(componentKey, Component, overrides = {}, onTrackClick = vi.fn()) {
  if (componentKey === "w9-request" && !DataBridge.getW9Vendors().length) {
    DataBridge.saveW9Vendors(structuredClone(SAMPLE_W9_REQUEST_DRAFT.vendors));
    DataBridge.set("paperworkkit.w9Request.draft", structuredClone(SAMPLE_W9_REQUEST_DRAFT));
  }
  return mountTool(
    React.createElement(
      NextIntlClientProvider,
      {
        locale: "fr",
        timeZone: "UTC",
        onError: intlErrors,
        messages: {
          ...getCommonMessages("fr"),
          Tool: toolMessageTree({ ...getPaperworkToolMessages(componentKey), ...overrides }),
        },
      },
      React.createElement(Component, { onTrackClick }),
    ),
  );
}

async function key(element, value) {
  expect(element).toBeTruthy();
  await act(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })));
}

test.each([
  ["receipt-generator", ReceiptGeneratorPage, "receipt.receiptGenerator", "Créer un reçu"],
  ["expense-report", ExpenseReportPage, "expense.expenseReportGenerator", "Rapport de dépenses"],
  ["mileage-log", MileageLogPage, "mileage.mileageLogTracker", "Journal kilométrique"],
  ["quarterly-tax-estimator", QuarterlyTaxEstimatorPage, "tax.quarterlyTaxEstimator", "Estimation trimestrielle"],
  ["w9-request", W9RequestPage, "w9.w9RequestOnboardingTracker", "Demandes W-9"],
  ["1099-nec-tracker", NecTrackerPage, "nec.label1099NecContractorPaymentsTracker", "Paiements aux prestataires"],
])("%s renders the tool-scoped translated interface", async (componentKey, Component, titleKey, title) => {
  const view = await mountPaperwork(componentKey, Component, { [`runtime.${titleKey}`]: title });
  expect([...view.container.querySelectorAll("h1, h2")].some((heading) => heading.textContent === title)).toBe(true);
  if (componentKey === "1099-nec-tracker") await click(button("Log Payment", view.container));
  expect(view.container.querySelectorAll("input, textarea").length).toBeGreaterThan(0);
});

test("W-9 translated status choices save their canonical enum and retain authored profile fields", async () => {
  const track = vi.fn();
  const view = await mountPaperwork(
    "w9-request",
    W9RequestPage,
    {
      "runtime.w9.w9RequestComplianceStatus": "État de la demande",
      "runtime.w9.status.Received": "Reçu",
      "runtime.w9.status.Needs Review": "À vérifier",
      "runtime.w9.saveProfileUpdates": "Enregistrer le profil",
      "runtime.w9.contractorProfileParametersUpdated": "Profil enregistré",
    },
    track,
  );
  const before = DataBridge.getW9Vendors()[0];
  const status = field("État de la demande", view.container);
  expect(status.textContent).toBe("Reçu");
  await key(status, "ArrowDown");
  const translatedOption = [...document.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent === "À vérifier",
  );
  await key(translatedOption, "Enter");
  expect(status.textContent).toBe("À vérifier");
  await click(button("Enregistrer le profil", view.container));

  expect(DataBridge.getW9Vendors()[0]).toEqual({ ...before, w9Status: "Needs Review" });
  expect(DataBridge.get("paperworkkit.w9Request.draft", null).vendors[0].w9Status).toBe("Needs Review");
  expect(window.alert).not.toHaveBeenCalled();
  expect(track).toHaveBeenCalledWith("w9_vendor_updated");
});

test("saving an unchanged W-9 profile preserves its canonical entity and status", async () => {
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.saveProfileUpdates": "Enregistrer le profil",
  });
  const before = DataBridge.getW9Vendors()[0];
  await click(button("Enregistrer le profil", view.container));
  expect(DataBridge.getW9Vendors()[0]).toEqual(before);
});

test("switching W-9 profiles retains the selected vendor's entity and status when saved", async () => {
  const first = SAMPLE_W9_REQUEST_DRAFT.vendors[0];
  const second = {
    ...first,
    id: "vendor-two",
    legalName: "Second Partner",
    businessName: "Second Business",
    entityType: "Partnership",
    w9Status: "Requested",
  };
  DataBridge.saveW9Vendors([first, second]);
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.saveProfileUpdates": "Enregistrer le profil",
  });
  await click(button(/Second Partner/, view.container));
  await click(button("Enregistrer le profil", view.container));
  expect(DataBridge.getW9Vendors()).toMatchObject([first, second]);
});

test("W-9 validation uses the translated field error and clears it after correction", async () => {
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.contractorLegalName": "Nom légal du prestataire",
    "runtime.w9.contractorLegalNameIsRequiredToFormulateProfiles": "Saisissez le nom légal du prestataire.",
    "runtime.w9.saveProfileUpdates": "Enregistrer le profil",
  });
  const name = field("Nom légal du prestataire", view.container);
  const storedName = DataBridge.getW9Vendors()[0].legalName;
  await fill(name, "   ");
  await click(button("Enregistrer le profil", view.container));
  const error = document.getElementById(name.getAttribute("aria-errormessage"));
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(error?.getAttribute("role")).toBe("alert");
  expect(error?.textContent).toBe("Saisissez le nom légal du prestataire.");
  expect(DataBridge.getW9Vendors()[0].legalName).toBe(storedName);

  await fill(name, "María Example");
  expect(name.getAttribute("aria-invalid")).toBe("false");
  expect(view.container.contains(error)).toBe(false);
  await click(button("Enregistrer le profil", view.container));
  expect(DataBridge.getW9Vendors()[0].legalName).toBe("María Example");
});

test("W-9 email actions are translated while copied document text and user instructions remain exact", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.label2CopyW9ComplianceRequestEmail": "Préparer le courriel W-9",
    "runtime.w9.secureSubmissionInstructions": "Instructions de transmission",
    "runtime.w9.emailSubjectLine": "Objet du courriel",
    "runtime.w9.copySubjectBody": "Copier le courriel",
    "runtime.w9.copiedsubjectbody": "Courriel copié",
    "runtime.w9.requestDisclaimer": "Demande uniquement : ne transmettez aucun identifiant fiscal ici.",
  });
  const emailTab = [...view.container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "Préparer le courriel W-9",
  );
  await key(emailTab, "Enter");
  const instructions = "Send the form using our secure Acme portal. Reference: CONTRACT-42.";
  await fill(field("Instructions de transmission", view.container), instructions);
  const vendor = DataBridge.getW9Vendors()[0];
  const expected = createW9Request({
    reportingYear: DEFAULT_W9_REQUEST_DRAFT.reportingYear,
    contractorName: vendor.legalName,
    contractorBusinessName: vendor.businessName,
    secureSubmissionInstructions: instructions,
  });
  expect(view.container.textContent).toContain("Objet du courriel");
  expect(view.container.textContent).toContain("Demande uniquement : ne transmettez aucun identifiant fiscal ici.");
  expect(view.container.textContent).toContain(expected.subject);
  expect(view.container.textContent).toContain(expected.body);
  expect(expected.body).toContain(W9_REQUEST_DISCLAIMER);
  await click(button("Copier le courriel", view.container));
  expect(writeText).toHaveBeenCalledWith(`Subject: ${expected.subject}\n\n${expected.body}`);
  expect(button("Courriel copié", view.container)).toBeTruthy();
  expect(DataBridge.get("paperworkkit.w9Request.draft", null).secureSubmissionInstructions).toBe(instructions);
});

test.each([
  {
    componentKey: "quarterly-tax-estimator",
    Component: QuarterlyTaxEstimatorPage,
    storageKey: DataBridgeKeys.TAX_DRAFT,
    draft: { ...DEFAULT_QUARTERLY_TAX_DRAFT, taxYear: 2030 },
    messageKey: "tax.validation.rulesUpdateRequired",
    message: "Mettez à jour les règles fiscales pour {year}.",
    expected: "Mettez à jour les règles fiscales pour 2030.",
  },
  {
    componentKey: "mileage-log",
    Component: MileageLogPage,
    storageKey: DataBridgeKeys.MILEAGE_DRAFT,
    draft: { ...DEFAULT_MILEAGE_DRAFT, taxYear: 2030 },
    messageKey: "mileage.validation.rulesYearUnavailable",
    message: "Barème kilométrique indisponible pour {year}.",
    expected: "Barème kilométrique indisponible pour 2030.",
  },
  {
    componentKey: "1099-nec-tracker",
    Component: NecTrackerPage,
    storageKey: DataBridgeKeys.NEC_DRAFT,
    draft: { ...DEFAULT_NEC_TRACKER_DRAFT, reportingYear: 2030 },
    messageKey: "nec.validation.rulesUpdateRequired",
    message: "Mettez à jour les règles 1099-NEC pour {year}.",
    expected: "Mettez à jour les règles 1099-NEC pour 2030.",
  },
])(
  "$componentKey renders the named dynamic validation message",
  async ({ componentKey, Component, storageKey, draft, messageKey, message, expected }) => {
    DataBridge.set(storageKey, draft);
    const view = await mountPaperwork(componentKey, Component, { [`runtime.${messageKey}`]: message });
    expect(view.container.textContent).toContain(expected);
    expect(DataBridge.get(storageKey, null)).toMatchObject(draft);
  },
);

test("advanced required columns block export with localized feedback until authored data is complete", async () => {
  const template = {
    ...structuredClone(seedTemplates[0]),
    id: "receipt-required-column-test",
    name: "Acme receipt template",
    documentType: "receipt",
    layoutFamily: "advanced",
    status: "published",
    config: createAdvancedTemplateConfig("receipt", "RECEIPT_80MM"),
  };
  template.config.form.sections = [
    {
      id: "delivery",
      label: "Authored delivery details",
      entries: [
        {
          kind: "repeater",
          key: "custom.delivery",
          label: "Delivery details",
          enabled: true,
          required: true,
          minRows: 1,
          columns: [{ key: "reference", label: "Dispatch reference", control: "text", required: true }],
        },
      ],
    },
  ];
  const draft = receiptAdapter.getSampleDraft();
  function Workspace() {
    const [currentDraft, setDraft] = React.useState(draft);
    return React.createElement(AdvancedTemplateWorkspace, {
      adapter: receiptAdapter,
      draft: currentDraft,
      onDraftChange: setDraft,
      templates: [template],
    });
  }
  const view = await mountPaperwork("receipt-generator", Workspace, {
    "runtime.shared.advanced.downloadPdf": "Télécharger le PDF",
    "runtime.shared.advanced.incompleteColumn": "Complétez les colonnes requises : {field}.",
  });
  expect(view.container.textContent).toContain("Authored delivery details");
  await click(button("Télécharger le PDF", view.container));
  const error = [...view.container.querySelectorAll('[role="alert"]')].find(
    (alert) => alert.textContent === "Complétez les colonnes requises : Delivery details.",
  );
  expect(error).toBeTruthy();
  expect(downloadAdvancedDocumentPdf).not.toHaveBeenCalled();

  await fill(field("Dispatch reference", view.container), "SHIP-42 / Smith & Co.");
  expect(view.container.contains(error)).toBe(false);
  await click(button("Télécharger le PDF", view.container));
  expect(downloadAdvancedDocumentPdf).toHaveBeenCalledTimes(1);
  const exported = vi.mocked(downloadAdvancedDocumentPdf).mock.calls[0][0];
  expect(exported.template).toBe(template);
  expect(exported.fileName).toBe(receiptAdapter.fileName(draft));
  expect(JSON.parse(exported.data["custom.delivery"])).toEqual([
    expect.objectContaining({ reference: "SHIP-42 / Smith & Co." }),
  ]);
  expect(exported.data.businessName).toBe(draft.business.name);
});

test("receipt layout keyboard choices preserve authored fields through published PDF export", async () => {
  const template = {
    ...structuredClone(seedTemplates[0]),
    id: "receipt-layout-keyboard-test",
    name: "Authored receipt layout",
    documentType: "receipt",
    layoutFamily: "advanced",
    status: "published",
    config: createAdvancedTemplateConfig("receipt", "RECEIPT_80MM"),
  };
  const templates = [template];
  DataBridge.set(DataBridgeKeys.RECEIPT_DRAFT, receiptAdapter.getSampleDraft());
  function ReceiptWorkspace() {
    return React.createElement(ReceiptGeneratorPage, { templates, onTrackClick: vi.fn() });
  }
  const view = await mountPaperwork("receipt-generator", ReceiptWorkspace, {
    "runtime.receipt.receiptVisualLayout": "Disposition du reçu",
    "runtime.receipt.companySellerName": "Nom du vendeur",
    "runtime.receipt.receiptNumber": "Numéro du reçu",
    "runtime.receipt.themes.classic": "Classique",
    "runtime.receipt.themes.compact": "Compact",
    "runtime.shared.templates.layoutLabel": "Disposition : {layout}",
    "runtime.shared.advanced.downloadPdf": "Télécharger le PDF",
  });
  const layout = view.container.querySelector('[role="combobox"][aria-label="Disposition du reçu"]');
  expect(layout.textContent).toBe("Disposition : Authored receipt layout");
  await fill(field("Nom du vendeur", view.container), "Authored Seller Ltd");
  await fill(field("Numéro du reçu", view.container), "RCP-EDITED-42");

  async function chooseLayout(label) {
    await key(layout, "ArrowDown");
    const option = [...document.querySelectorAll('[role="option"]')].find((element) => element.textContent === label);
    await key(option, "Enter");
    expect(layout.textContent).toBe(label);
    expect(field("Nom du vendeur", view.container).value).toBe("Authored Seller Ltd");
    expect(field("Numéro du reçu", view.container).value).toBe("RCP-EDITED-42");
    expect(DataBridge.get(DataBridgeKeys.RECEIPT_DRAFT, null)).toMatchObject({
      business: { name: "Authored Seller Ltd" },
      receiptNumber: "RCP-EDITED-42",
    });
  }
  await chooseLayout("Disposition : Classique");
  await chooseLayout("Disposition : Compact");
  await chooseLayout("Disposition : Authored receipt layout");
  await click(button("Télécharger le PDF", view.container));
  expect(downloadAdvancedDocumentPdf).toHaveBeenCalledTimes(1);
  const exported = vi.mocked(downloadAdvancedDocumentPdf).mock.calls[0][0];
  expect(exported.template).toBe(template);
  expect(exported.data.businessName).toBe("Authored Seller Ltd");
  expect(exported.data.receiptNumber).toBe("RCP-EDITED-42");
});

test("related tools preserve catalog English fallback and published French hrefs under a French provider", async () => {
  const tools = [
    {
      id: "invoice",
      componentKey: "invoice-generator",
      slug: "invoice-generator",
      name: "Invoice Generator",
      description: "Create an invoice.",
      href: "/paperwork/invoice-generator",
    },
    {
      id: "expense",
      componentKey: "expense-report",
      slug: "expense-report",
      name: "Rapport de dépenses",
      description: "Préparez votre rapport de dépenses.",
      href: "/fr/paperwork/expense-report",
    },
  ];
  function RelatedToolsFixture({ onTrackClick }) {
    return React.createElement(RelatedTools, {
      currentComponentKey: "receipt-generator",
      onTrackClick,
      tools,
    });
  }
  const view = await mountPaperwork("receipt-generator", RelatedToolsFixture, {
    "runtime.shared.related.launchGenerator": "Ouvrir cet outil",
  });
  const links = [...view.container.querySelectorAll("a")];
  for (const tool of tools) {
    const link = links.find((candidate) => candidate.textContent.includes(tool.name));
    expect(link).toBeTruthy();
    expect(link.textContent).toContain("Ouvrir cet outil");
    expect(link.getAttribute("href")).toBe(tool.href);
  }
});

test("W-9 copy waits for clipboard completion", async () => {
  let complete;
  const writeText = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.label2CopyW9ComplianceRequestEmail": "Courriel",
    "runtime.w9.copySubjectBody": "Copier",
    "runtime.w9.copiedsubjectbody": "Copié",
  });
  await key(
    [...view.container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Courriel"),
    "Enter",
  );
  await click(button("Copier", view.container));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(button("Copié", view.container)).toBeFalsy();
  await act(async () => complete());
  expect(button("Copié", view.container)).toBeTruthy();
});

test("W-9 clipboard denial never announces successful copy", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const view = await mountPaperwork("w9-request", W9RequestPage, {
    "runtime.w9.label2CopyW9ComplianceRequestEmail": "Courriel",
    "runtime.w9.copySubjectBody": "Copier",
    "runtime.w9.copiedsubjectbody": "Copié",
  });
  await key(
    [...view.container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Courriel"),
    "Enter",
  );
  await click(button("Copier", view.container));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(button("Copié", view.container)).toBeFalsy();
});

test.each([false, true])(
  "Paperwork editor is usable before delayed hydration and preserves explicit edits: %s",
  async (editDuringLoad) => {
    const { default: App } = await import("../app/paperwork/components/App.tsx");
    const { PostgresApiProvider } = await import("../lib/paperwork/shared/dataBridge.ts");
    let release;
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    const owner = `anon_v2_${"a".repeat(64)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.endsWith("/vendors")) return delayed;
        const body = url.endsWith(encodeURIComponent(DataBridgeKeys.RECEIPT_DRAFT))
          ? { found: true, value: { receiptNumber: "Restored saved receipt" } }
          : { found: false, value: null };
        return Response.json(body, { headers: { "x-paperwork-owner": owner } });
      }),
    );
    const provider = new PostgresApiProvider();
    DataBridge.setProvider(provider);
    const view = await mountTool(
      React.createElement(
        GlobalToolSearchProvider,
        null,
        React.createElement(
          NextIntlClientProvider,
          {
            locale: "en",
            timeZone: "UTC",
            messages: {
              ...getCommonMessages("en"),
              Tool: toolMessageTree(getPaperworkToolMessages("receipt-generator")),
            },
          },
          React.createElement(App, {
            account: { user: null, returnTo: "/paperwork/receipt-generator" },
            componentKey: "receipt-generator",
            templates: [],
            tools: [
              {
                id: "paperwork.receipt-generator",
                componentKey: "receipt-generator",
                slug: "receipt-generator",
                name: "Receipt Generator",
                description: "Make receipts",
              },
            ],
          }),
        ),
      ),
    );
    expect(view.container.querySelector("#receipt-seller-name")).not.toBeNull();
    expect(provider.getReceiptDraft()).toBeNull();
    if (editDuringLoad) await fill(view.container.querySelector("#receipt-number"), "New typed receipt");
    await act(async () => {
      release(Response.json({ success: true, vendors: [] }, { headers: { "x-paperwork-owner": owner } }));
      await provider.whenReady();
    });
    expect(view.container.querySelector("#receipt-number").value).toBe(
      editDuringLoad ? "New typed receipt" : "Restored saved receipt",
    );
  },
);
