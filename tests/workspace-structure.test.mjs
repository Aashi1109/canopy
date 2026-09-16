import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function exists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("SmartTools is a root-owned direct-layout Next.js application", async () => {
  const packageJson = await readJson("package.json");
  assert.equal(packageJson.name, "smarttools");
  assert.equal(packageJson.private, true);
  assert.equal(typeof packageJson.dependencies.next, "string");
  assert.equal(await exists("apps"), false);
  assert.equal(await exists("components/smarttools/PublicInfoChrome.tsx"), true);
  assert.equal(await exists("app/paperwork/components/App.tsx"), true);
  assert.equal(await exists("app/layout.tsx"), true);
  assert.equal(await exists("src"), false);
});

test("pnpm discovers packages and services without nested applications", async () => {
  const workspace = await readFile(new URL("pnpm-workspace.yaml", root), "utf8");

  for (const pattern of ['"packages/*"', '"services/*"']) {
    assert.match(workspace, new RegExp(`- ${pattern.replace("*", "\\*")}`));
  }
  assert.doesNotMatch(workspace, /-\s*["']apps\/\*["']/);
});

test("public tools use scoped server-resolved dynamic slugs", async () => {
  const [paperworkCatalog, paperworkTool, devtoolsCatalog, devtoolsTool, mediaCatalog, mediaTool] =
    await Promise.all([
      readFile(new URL("app/paperwork/page.tsx", root), "utf8"),
      readFile(new URL("app/paperwork/[slug]/page.tsx", root), "utf8"),
      readFile(new URL("app/devtools/page.tsx", root), "utf8"),
      readFile(new URL("app/devtools/[slug]/page.tsx", root), "utf8"),
      readFile(new URL("app/media/page.tsx", root), "utf8"),
      readFile(new URL("app/media/[slug]/page.tsx", root), "utf8"),
    ]);

  assert.match(paperworkCatalog, /getAvailableTools\(["']paperwork["'][,)]/);
  assert.match(paperworkCatalog, /href=\{`\/paperwork\/\$\{tool\.slug\}`\}/);
  assert.match(paperworkTool, /getAvailableToolBySlug\(["']paperwork["']/);
  assert.match(paperworkTool, /notFound\(\)/);
  assert.match(paperworkTool, /componentKey/);
  // Devtools and Media resolve through the tool framework's catalogue; only
  // Paperwork still reads the control plane directly.
  assert.match(devtoolsCatalog, /getTools\(["']devtools["']\)/);
  assert.match(devtoolsCatalog, /`\/devtools\/\$\{tool\.slug\}`/);
  assert.doesNotMatch(devtoolsCatalog, /redirect\(/);
  assert.match(devtoolsTool, /resolveToolPage\(["']devtools["']/);
  assert.match(devtoolsTool, /notFound\(\)/);
  assert.match(mediaCatalog, /getTools\(["']media["']\)/);
  assert.match(mediaCatalog, /`\/media\/\$\{tool\.slug\}`/);
  assert.match(mediaTool, /resolveToolPage\(["']media["']/);
  assert.match(mediaTool, /notFound\(\)/);
  // Prerendering a slug would need a redeploy per admin toggle.
  assert.doesNotMatch(devtoolsTool, /export\s[^\n]*generateStaticParams/);
  assert.doesNotMatch(mediaTool, /export\s[^\n]*generateStaticParams/);

  for (const path of [
    "app/paperwork/receipt-generator/page.tsx",
    "app/paperwork/expense-report/page.tsx",
    "app/paperwork/mileage-log/page.tsx",
    "app/paperwork/quarterly-tax-estimator/page.tsx",
    "app/paperwork/w9-request/page.tsx",
    "app/paperwork/1099-nec-tracker/page.tsx",
    "app/devtools/json-formatter/page.tsx",
  ]) {
    assert.equal(await exists(path), false, `${path} must stay dynamic`);
  }
});

test("root scripts run the root-owned application directly", async () => {
  const packageJson = await readJson("package.json");

  assert.match(packageJson.scripts.dev, /\bnext dev -p 3000$/);
  assert.match(packageJson.scripts["test:media"], /\bnode --test\b/);
  // The media processing source lives in the tool framework; `app/media/` is
  // now only the route shell and holds nothing worth covering.
  assert.match(packageJson.scripts["test:media"], /lib\/tool-framework\/media/);
  assert.doesNotMatch(packageJson.scripts.dev, /--filter/);
  assert.doesNotMatch(packageJson.scripts["test:media"], /--filter/);
  for (const script of [
    "dev:platform",
    "dev:paperwork",
    "dev:devtools",
    "dev:media",
    "dev:admin",
    "dev:auth",
  ]) {
    assert.equal(packageJson.scripts[script], undefined);
  }
});

test("Paperwork navigation uses scoped paths without URL hashes", async () => {
  const navigationFiles = [
    "app/paperwork/components/App.tsx",
    "app/paperwork/components/RelatedTools.tsx",
  ];
  const source = (
    await Promise.all(navigationFiles.map((path) => readFile(new URL(path, root), "utf8")))
  ).join("\n");

  assert.doesNotMatch(source, /window\.location\.hash|hashchange|href\s*=\s*["']#|\bhash:\s*["']#/);
  assert.match(source, /["']\/paperwork/);
});

test("contact and privacy are global while Paperwork-owned information stays scoped", async () => {
  const app = await readFile(new URL("app/paperwork/components/App.tsx", root), "utf8");

  for (const slug of ["contact", "privacy"]) {
    const page = await readFile(new URL(`app/${slug}/page.tsx`, root), "utf8");
    assert.match(app, new RegExp(`href(?:=|:)\\s*["']/${slug}["']`));
    assert.match(page, /PublicInfoChrome/);
    assert.doesNotMatch(app, new RegExp(`/paperwork/${slug}`));
  }

  for (const slug of ["about", "terms"]) {
    const page = await readFile(new URL(`app/paperwork/${slug}/page.tsx`, root), "utf8");
    assert.match(app, new RegExp(`href(?:=|:)\\s*["']/paperwork/${slug}["']`));
    assert.match(page, /InformationPage/);
  }
});

test("Paperwork routes components from managed tool props", async () => {
  const source = await readFile(new URL("app/paperwork/components/App.tsx", root), "utf8");

  assert.match(source, /componentKey/);
  assert.match(source, /tools/);
  assert.match(source, /templates/);
  assert.doesNotMatch(source, /usePathname|useRouter/);
  assert.doesNotMatch(source, /AdminAuthGate|TemplateService/);
});

test("legacy Paperwork template administration is removed", async () => {
  for (const path of [
    "app/paperwork/admin/[[...route]]/page.tsx",
    "app/api/paperwork/admin/verify/route.ts",
    "app/paperwork/components/admin/AdminAuthGate.tsx",
    "app/paperwork/components/admin/FormGroups.tsx",
    "app/paperwork/components/admin/FullPagePreviewer.tsx",
    "app/paperwork/components/admin/TemplateEditor.tsx",
    "app/paperwork/components/admin/TemplateListTable.tsx",
    "lib/paperwork/admin/session.ts",
    "lib/paperwork/templates/templateService.ts",
  ]) {
    assert.equal(await exists(path), false, `${path} must stay removed`);
  }

  const [environment, bootstrap, schema] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("db/bootstrap.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(environment, /ADMIN_PASSCODE/);
  assert.doesNotMatch(bootstrap, /admin_passcode|ADMIN_PASSCODE|invoice_templates/);
  assert.doesNotMatch(schema, /appConfigTable|invoiceTemplatesTable/);
});

test("Paperwork exposes published templates through its scoped read-only API", async () => {
  const route = await readFile(new URL("app/api/paperwork/templates/route.ts", root), "utf8");

  assert.match(route, /getPublishedTemplates/);
  assert.match(route, /getAvailableTools/);
  assert.match(route, /tool\.componentKey === componentKey/);
  assert.match(route, /export\s+async\s+function\s+GET/);
  assert.doesNotMatch(route, /export\s+async\s+function\s+POST/);
  assert.doesNotMatch(route, /localStorage|invoiceTemplatesTable/);
});

test("Paperwork scoped persistence APIs check the owning tool", async () => {
  const [accessSource, storage, storedKey, vendors] = await Promise.all([
    readFile(new URL("lib/paperwork/toolAccess.ts", root), "utf8"),
    readFile(new URL("app/api/paperwork/storage/route.ts", root), "utf8"),
    readFile(new URL("app/api/paperwork/storage/[key]/route.ts", root), "utf8"),
    readFile(new URL("app/api/paperwork/vendors/route.ts", root), "utf8"),
  ]);

  assert.match(accessSource, /getAvailableToolBySlug/);
  assert.match(storage, /requireAvailableToolForStorageKey/);
  assert.match(storedKey, /requireAvailableToolForStorageKey/);
  assert.match(vendors, /requireAnyAvailablePaperworkTool/);
});

test("Admin and Media ordering use the shared accessible drag-and-drop list", async () => {
  const [editor, toolList, orderableList] = await Promise.all([
    readFile(
      new URL("app/admin/(protected)/templates/[id]/components/TemplateEditor.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/admin/(protected)/tools/components/ToolList.tsx", root), "utf8"),
    readFile(new URL("packages/ui/src/components/OrderableList.tsx", root), "utf8"),
  ]);

  assert.match(editor, /<OrderableList/);
  assert.match(editor, /GripVertical/);
  assert.doesNotMatch(editor, /moveSection|ArrowUp|ArrowDown/);
  assert.match(toolList, /@smarttools\/ui\/components\/OrderableList/);
  assert.match(orderableList, /KeyboardSensor/);
  assert.match(orderableList, /PointerSensor/);
  assert.match(orderableList, /sortableKeyboardCoordinates/);
});
