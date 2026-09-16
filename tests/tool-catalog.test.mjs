import assert from "node:assert/strict";
import test from "node:test";

import {
  areToolSlugsUnique,
  assertToolSlugImmutable,
  findAvailableToolBySlug,
  getEnabledTools,
  isToolAvailable,
  isValidToolSlug,
  mergeManagedTool,
  mergeToolManifest,
  reservedToolSlugs,
  slugFromName,
} from "../packages/tool-catalog/src/index.ts";

// The package holds no inventory, so these tests supply their own manifest.
// That is the point: the merge is pure, and its semantics must hold for any
// manifest, not for one particular list of shipped tools. Every expectation
// below is derived from this fixture, never from a literal count.
const MANIFEST = [
  {
    id: "paperwork.alpha",
    app: "paperwork",
    componentKey: "alpha",
    defaultName: "Alpha",
    defaultDescription: "The first.",
  },
  {
    id: "paperwork.beta",
    app: "paperwork",
    componentKey: "beta",
    defaultName: "Beta",
    defaultDescription: "The second.",
  },
  {
    id: "devtools.gamma",
    app: "devtools",
    category: "Fixtures",
    componentKey: "gamma",
    defaultName: "Gamma",
    defaultDescription: "The third.",
  },
  {
    id: "media.delta",
    app: "media",
    category: "Fixtures",
    componentKey: "delta",
    defaultName: "Delta",
    defaultDescription: "The fourth.",
  },
];

const manifestFor = (app) => MANIFEST.filter((entry) => entry.app === app);
const paperwork = manifestFor("paperwork");
const [firstPaperwork, secondPaperwork] = paperwork;
const firstDevtool = manifestFor("devtools")[0];

// An arbitrary order value that cannot collide with a merged order.
const STORED_ORDER = MANIFEST.length;

/** A stored row that keeps a tool exactly as its manifest entry describes it. */
function row(entry, changes = {}) {
  return {
    toolId: entry.id,
    slug: entry.componentKey,
    name: entry.defaultName,
    description: entry.defaultDescription,
    order: MANIFEST.filter((other) => other.app === entry.app).indexOf(entry),
    enabled: true,
    archived: false,
    ...changes,
  };
}

/** Every tool configured and live, which is what most assertions start from. */
const configured = () =>
  mergeToolManifest(
    MANIFEST.map((entry) => row(entry)),
    MANIFEST,
  );

function merge(...storedRows) {
  return mergeToolManifest(storedRows, MANIFEST);
}

function resolve(storedRow) {
  return merge(storedRow).find((tool) => tool.id === storedRow.toolId);
}

test("the manifest is the map: one resolved tool per entry, in manifest order", () => {
  const tools = merge();

  assert.deepEqual(
    tools.map((tool) => tool.id),
    MANIFEST.map((entry) => entry.id),
  );
  assert.equal(tools.length, MANIFEST.length);
});

test("stored rows override the seeded name, description, order, and enabled flag", () => {
  const tool = resolve({
    toolId: firstPaperwork.id,
    slug: firstPaperwork.componentKey,
    name: "Configured Name",
    description: "Configured externally.",
    order: STORED_ORDER,
    enabled: true,
    archived: false,
  });

  assert.equal(tool?.name, "Configured Name");
  assert.equal(tool?.description, "Configured externally.");
  assert.equal(tool?.order, STORED_ORDER);
  assert.equal(tool?.enabled, true);
});

test("merging keeps every code registration and drops unknown stored tool ids", () => {
  const tools = merge(
    {
      toolId: secondPaperwork.id,
      slug: "receipts",
      name: "Receipt Maker",
      description: "Create a receipt.",
      order: STORED_ORDER,
      enabled: false,
      archived: true,
    },
    {
      toolId: "removed.unknown-tool",
      slug: "removed",
      name: "Removed",
      description: "No longer registered.",
      order: STORED_ORDER,
      enabled: true,
      archived: false,
    },
  );

  assert.equal(tools.length, MANIFEST.length);
  assert.deepEqual(
    tools.find((tool) => tool.id === secondPaperwork.id),
    {
      ...secondPaperwork,
      toolId: secondPaperwork.id,
      slug: "receipts",
      name: "Receipt Maker",
      description: "Create a receipt.",
      order: STORED_ORDER,
      enabled: false,
      archived: true,
    },
  );
  assert.equal(
    tools.some((tool) => tool.id === "removed.unknown-tool"),
    false,
    "a stored row named by no manifest entry is dropped, silently",
  );
});

test("blank stored strings and non-integer orders fall back to the manifest", () => {
  const tool = resolve({
    toolId: firstPaperwork.id,
    slug: firstPaperwork.componentKey,
    name: "   ",
    description: "",
    order: "not-an-integer",
    enabled: true,
    archived: false,
  });

  assert.equal(tool?.name, firstPaperwork.defaultName);
  assert.equal(tool?.description, firstPaperwork.defaultDescription);
  assert.equal(tool?.order, paperwork.indexOf(firstPaperwork));
});

test("invalid persisted slugs fail closed while valid fields still merge", () => {
  const tool = resolve({
    toolId: secondPaperwork.id,
    slug: "Receipt--Generator",
    name: "Receipt Maker",
    description: "Create a receipt.",
    order: STORED_ORDER,
    enabled: true,
    archived: false,
  });

  assert.equal(tool?.slug, null);
  assert.equal(tool?.enabled, false, "a routeless tool can never be enabled");
  assert.equal(tool?.name, "Receipt Maker");
});

test("a cleared slug returns the tool to setup-required and disabled", () => {
  const tool = resolve(row(firstPaperwork, { slug: null, order: STORED_ORDER }));

  assert.equal(tool?.slug, null);
  assert.equal(tool?.enabled, false);
  assert.equal(isToolAvailable(tool), false);
});

test("an archived tool stops being available even while enabled", () => {
  const tool = resolve(row(firstPaperwork, { archived: true }));

  assert.equal(tool?.archived, true);
  assert.equal(isToolAvailable(tool), false);
});

test("an unconfigured tool is setup-required and disabled by default", () => {
  // No stored row at all: the merge must not invent a route from the component
  // key, which is what would silently publish a tool nobody configured.
  assert.deepEqual(merge(), [
    ...MANIFEST.map((entry) => ({
      ...entry,
      toolId: entry.id,
      slug: null,
      name: entry.defaultName,
      description: entry.defaultDescription,
      order: manifestFor(entry.app).indexOf(entry),
      enabled: false,
      archived: false,
    })),
  ]);
});

test("mergeManagedTool falls back wholesale when the stored value is not a row", () => {
  const fallback = {
    toolId: firstPaperwork.id,
    slug: null,
    name: firstPaperwork.defaultName,
    description: firstPaperwork.defaultDescription,
    order: 0,
    enabled: false,
    archived: false,
  };

  for (const stored of [undefined, null, "row", 7, [{ slug: "alpha" }]]) {
    assert.deepEqual(mergeManagedTool(firstPaperwork, fallback, stored), fallback);
  }
});

test("tool slugs use lowercase segments and reject reserved application routes", () => {
  for (const slug of ["invoice", "invoice-2", "2fa-tool", "w9-request"]) {
    assert.equal(isValidToolSlug("paperwork", slug), true, slug);
  }

  for (const slug of [
    "",
    "Invoice",
    "invoice_generator",
    "invoice--generator",
    "-invoice",
    "invoice-",
    "/invoice",
    null,
    undefined,
  ]) {
    assert.equal(isValidToolSlug("paperwork", slug), false, String(slug));
  }

  for (const [app, reserved] of Object.entries(reservedToolSlugs)) {
    for (const slug of reserved) {
      assert.equal(isValidToolSlug(app, slug), false, `${app}:${slug}`);
    }
  }
  assert.equal(isValidToolSlug(firstDevtool.app, firstDevtool.componentKey), true);
});

test("slugFromName produces a valid slug or refuses", () => {
  assert.equal(slugFromName("Receipt & Invoice Maker"), "receipt-and-invoice-maker");
  assert.equal(isValidToolSlug("devtools", slugFromName("JSON  Formatter!")), true);
  assert.throws(() => slugFromName("---"), /at least one letter or number/i);
});

test("tool slugs are unique within an application but may repeat across applications", () => {
  const tools = configured();
  const takenSlug = firstPaperwork.componentKey;
  const withSlug = (id, slug) => tools.map((tool) => (tool.id === id ? { ...tool, slug } : tool));

  assert.equal(areToolSlugsUnique(tools, MANIFEST), true);
  assert.equal(areToolSlugsUnique(withSlug(secondPaperwork.id, takenSlug), MANIFEST), false);
  assert.equal(areToolSlugsUnique(withSlug(firstDevtool.id, takenSlug), MANIFEST), true);
  assert.equal(areToolSlugsUnique(withSlug(secondPaperwork.id, null), MANIFEST), true);
  assert.equal(
    areToolSlugsUnique([{ ...tools[0], toolId: "removed.unknown-tool" }], MANIFEST),
    false,
    "a slug held by no manifest entry cannot be proven unique",
  );
});

test("a saved slug is immutable while setup-required tools may receive their first slug", () => {
  assert.doesNotThrow(() => assertToolSlugImmutable(null, "proposal-builder"));
  assert.doesNotThrow(() => assertToolSlugImmutable("invoice-generator", "invoice-generator"));
  assert.throws(() => assertToolSlugImmutable("invoice-generator", "invoices"), /immutable/i);
  assert.throws(() => assertToolSlugImmutable("invoice-generator", null), /immutable/i);
});

test("disabled, archived, setup-required, and ambiguous tools are blocked", () => {
  const tools = configured();
  const slug = firstPaperwork.componentKey;
  const patch = (id, changes) => tools.map((tool) => (tool.id === id ? { ...tool, ...changes } : tool));

  const enabledPaperwork = getEnabledTools(tools, "paperwork");
  const disabled = patch(firstPaperwork.id, { enabled: false });
  const archived = patch(firstPaperwork.id, { archived: true });
  const setupRequired = patch(firstPaperwork.id, { slug: null });
  const duplicateRoute = patch(secondPaperwork.id, { slug });

  assert.equal(isToolAvailable(tools[0]), true);
  assert.deepEqual(
    getEnabledTools(disabled, "paperwork").map((tool) => tool.id),
    enabledPaperwork.filter((tool) => tool.id !== firstPaperwork.id).map((tool) => tool.id),
    "disabling one tool removes exactly that tool, in stored order",
  );
  assert.deepEqual(
    enabledPaperwork.map((tool) => tool.order),
    [...enabledPaperwork.map((tool) => tool.order)].sort((a, b) => a - b),
    "enabled tools come back sorted by stored order",
  );
  assert.deepEqual(
    getEnabledTools(tools)
      .map((tool) => tool.id)
      .sort(),
    MANIFEST.map((entry) => entry.id).sort(),
    "an omitted app returns every available tool",
  );

  for (const [label, candidates] of [
    ["disabled", disabled],
    ["archived", archived],
    ["setup-required", setupRequired],
    ["ambiguous", duplicateRoute],
  ]) {
    assert.equal(
      findAvailableToolBySlug(candidates, "paperwork", slug),
      undefined,
      `${label} tools must not resolve a route`,
    );
  }

  assert.equal(findAvailableToolBySlug(tools, "paperwork", slug)?.id, firstPaperwork.id);
  for (const reserved of reservedToolSlugs.paperwork) {
    assert.equal(findAvailableToolBySlug(tools, "paperwork", reserved), undefined);
  }
});
