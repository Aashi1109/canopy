import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { db } from "../db/index.ts";
import { createAdvancedTemplateConfig, seedTemplates } from "../lib/invoice-templates/index.ts";
import { getPublishedTemplates } from "../lib/admin/queries.ts";

function templateRow(overrides = {}) {
  const template = seedTemplates[0];
  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    category: template.category,
    status: "published",
    isDefault: template.isDefault,
    version: template.version,
    documentType: template.documentType,
    layoutFamily: template.layoutFamily,
    config: structuredClone(template.config),
    isPremium: false,
    requiredPlan: "free",
    createdAt: new Date(template.createdAt),
    updatedAt: new Date(template.updatedAt),
    ...overrides,
  };
}

async function withTemplateRows(rows, operation) {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSelect = db.select;
  const whereConditions = [];
  const chain = {
    from: () => chain,
    where: (condition) => {
      whereConditions.push(condition);
      const [, documentType] = queryParts(condition).params;
      return Promise.resolve(documentType ? rows.filter((row) => row.documentType === documentType) : rows);
    },
  };

  process.env.DATABASE_URL = "postgres://configured-for-unit-test";
  db.select = () => chain;
  try {
    return await operation(whereConditions);
  } finally {
    db.select = originalSelect;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
}

function queryParts(query) {
  const parts = { columns: [], params: [] };
  const visit = (chunk) => {
    if (chunk?.constructor?.name === "Param") {
      parts.params.push(chunk.value);
      return;
    }
    if (typeof chunk?.name === "string") {
      parts.columns.push(chunk.name);
      return;
    }
    for (const nested of chunk?.queryChunks ?? []) visit(nested);
  };
  visit(query);
  return parts;
}

test("published template queries validate advanced rows and filter by document type", async () => {
  const unsafeW9Config = createAdvancedTemplateConfig("w9-request", "A4");
  unsafeW9Config.sampleData["custom.reference"] = "123-45-6789";
  const legacyInvoiceConfig = createAdvancedTemplateConfig("invoice", "A4");
  delete legacyInvoiceConfig.schemaVersion;
  delete legacyInvoiceConfig.form;
  legacyInvoiceConfig.template.schemas = legacyInvoiceConfig.template.schemas.map((page) =>
    page.filter((schema) => schema.name !== "balanceDue"),
  );
  const rows = [
    templateRow(),
    templateRow({
      id: "advanced-invoice",
      slug: "advanced-invoice",
      isDefault: false,
      layoutFamily: "advanced",
      config: createAdvancedTemplateConfig("invoice", "A4"),
    }),
    templateRow({
      id: "legacy-invoice",
      slug: "legacy-invoice",
      isDefault: false,
      layoutFamily: "advanced",
      config: legacyInvoiceConfig,
    }),
    templateRow({
      id: "advanced-receipt",
      slug: "advanced-receipt",
      isDefault: false,
      documentType: "receipt",
      layoutFamily: "advanced",
      config: createAdvancedTemplateConfig("receipt", "RECEIPT_80MM"),
    }),
    templateRow({
      id: "invalid-receipt",
      slug: "invalid-receipt",
      isDefault: false,
      documentType: "receipt",
      layoutFamily: "advanced",
      config: createAdvancedTemplateConfig("invoice", "A4"),
    }),
    templateRow({
      id: "unsafe-w9",
      slug: "unsafe-w9",
      isDefault: false,
      documentType: "w9-request",
      layoutFamily: "advanced",
      config: unsafeW9Config,
    }),
  ];

  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args);
  try {
    await withTemplateRows(rows, async (whereConditions) => {
      const allTemplates = await getPublishedTemplates();
      assert.deepEqual(
        allTemplates.map((template) => template.id),
        [seedTemplates[0].id, "advanced-invoice", "legacy-invoice", "advanced-receipt"],
      );
      assert.equal(allTemplates[0].createdAt, rows[0].createdAt.toISOString());
      assert.equal(allTemplates[0].requiredPlan, "free");
      assert.deepEqual(
        (await getPublishedTemplates("invoice")).map((template) => template.id),
        [seedTemplates[0].id, "advanced-invoice", "legacy-invoice"],
      );
      assert.deepEqual(
        (await getPublishedTemplates("receipt")).map((template) => template.id),
        ["advanced-receipt"],
      );
      assert.deepEqual(queryParts(whereConditions[0]), {
        columns: ["status"],
        params: ["published"],
      });
      assert.deepEqual(queryParts(whereConditions[1]), {
        columns: ["status", "document_type"],
        params: ["published", "invoice"],
      });
      assert.deepEqual(queryParts(whereConditions[2]), {
        columns: ["status", "document_type"],
        params: ["published", "receipt"],
      });
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(
    loggedErrors.some((args) => args.includes("invalid-receipt")),
    "invalid stored template IDs are logged",
  );
  assert.ok(
    loggedErrors.some((args) => args.includes("unsafe-w9")),
    "compliance-invalid stored template IDs are logged",
  );
});

test("published template query keeps the seed fallback and applies its filter", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const expectedInvoices = seedTemplates
      .filter((template) => template.status === "published")
      .map((template) => template.id);

    assert.deepEqual(
      (await getPublishedTemplates("invoice")).map((template) => template.id),
      expectedInvoices,
    );
    assert.deepEqual(await getPublishedTemplates("receipt"), []);
  } finally {
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("templates API validates its document type and defaults to invoices", async () => {
  const route = await readFile(new URL("../app/api/paperwork/templates/route.ts", import.meta.url), "utf8");

  assert.match(route, /GET\(request:\s*(?:Next)?Request\)/);
  assert.match(route, /getAll\("documentType"\)/);
  assert.match(route, /documentTypes\.length\s*===\s*0\s*\?\s*"invoice"/);
  assert.match(route, /documentTypes\.length\s*>\s*1/);
  assert.match(route, /DocumentTypeSchema\.safeParse\(documentType\)/);
  assert.match(route, /status:\s*400/);
  assert.match(route, /getDocumentDefinition\((?:validated|parsed)?DocumentType(?:\.data)?\)\.toolComponentKey/);
  assert.match(route, /getPublishedTemplates\((?:validated|parsed)?DocumentType(?:\.data)?\)/);
});
