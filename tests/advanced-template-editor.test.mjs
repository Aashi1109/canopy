import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const advancedRoute = "app/admin/(protected)/templates/[id]/advanced/page.tsx";
const advancedEditor = "app/admin/(protected)/templates/[id]/advanced/components/AdvancedTemplateEditor.tsx";
const templatesPage = "app/admin/(protected)/templates/page.tsx";
const advancedCreateRoute = "app/admin/(protected)/templates/new/advanced/page.tsx";
const nextConfig = "next.config.ts";

test("advanced templates use a separate immersive route and leave the standard editor isolated", async () => {
  const [route, editor, list, createRoute, config] = await Promise.all([
    readFile(advancedRoute, "utf8"),
    readFile(advancedEditor, "utf8"),
    readFile(templatesPage, "utf8"),
    readFile(advancedCreateRoute, "utf8"),
    readFile(nextConfig, "utf8"),
  ]);

  assert.match(route, /requirePagePermission\("templates", "view"\)/);
  assert.match(route, /layoutFamily !== "advanced"/);
  assert.match(route, /AdvancedTemplateEditor/);

  assert.match(editor, /import\("@pdfme\/ui"\)/);
  assert.match(editor, /import\("@pdfme\/schemas"\)/);
  assert.match(editor, /import\("@pdfme\/generator"\)/);
  assert.match(editor, /onChangeTemplate/);
  assert.match(editor, /\.destroy\(\)/);
  assert.match(editor, /updateTemplateAction/);
  assert.match(editor, /updateAndPublishTemplateAction/);
  assert.match(editor, /resizeAdvancedTemplateConfig/);
  assert.match(editor, /aria-label="Page size"/);
  assert.match(editor, /pageFormat:\s*pageFormat/);
  assert.match(editor, /\n\s+Preview\n/);
  assert.match(editor, /propPanel\.defaultSchema/);
  assert.match(editor, /Add elements/);
  assert.match(editor, /Dynamic text/);
  assert.match(editor, /QR code/);
  assert.match(editor, /aria-label="Template canvas"/);
  assert.match(editor, /aria-label="Fit canvas"/);
  assert.match(editor, /aria-label="Previous page"/);
  assert.match(editor, /aria-label="Designer tools"/);
  assert.match(editor, /data-field-inspector-open/);
  assert.match(editor, /pendingPageRemoval/);
  assert.match(editor, /dialog\.showModal\(\)/);
  assert.match(editor, /Delete page \{pendingPageRemoval \+ 1\}/);
  assert.match(editor, /aria-expanded=\{documentStripOpen\}/);
  assert.match(editor, /aria-pressed=\{activePanel === "pages"\}/);
  assert.match(editor, /Edit on canvas/);
  assert.doesNotMatch(editor, /onClick=\{\(\) => removePage\(index\)\}/);
  assert.match(editor, /pdfme-designer-left-sidebar/);
  assert.match(editor, /pdfme-designer-right-sidebar/);
  assert.match(editor, /pdfme-designer-detail-view/);
  assert.match(editor, /sidebarOpen: false/);
  assert.doesNotMatch(editor, /sidebarOpen: next === "add"/);
  assert.doesNotMatch(editor, /Open design controls/);
  assert.doesNotMatch(editor, /function renderInspector/);
  assert.doesNotMatch(editor, /Selection inspector/);
  assert.doesNotMatch(editor, /Position & size/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);

  assert.match(list, /href="\/admin\/templates\/new\/advanced"/);
  assert.match(list, /Create an advanced template/);
  assert.doesNotMatch(list, /createAdvancedTemplateAction/);
  assert.match(createRoute, /createAdvancedTemplateAction/);
  assert.match(createRoute, /requirePagePermission\("templates", "create"\)/);
  assert.match(createRoute, /DOCUMENT_DEFINITIONS\.flatMap/);
  assert.match(createRoute, /definition\.allowedPageFormats\.map/);
  assert.match(createRoute, /RECEIPT_80MM: "80 mm receipt"/);
  assert.match(createRoute, /RECEIPT_58MM: "58 mm receipt"/);
  assert.match(createRoute, /Create &amp; open designer/);
  assert.match(list, /\/advanced/);
  assert.match(config, /module:\s*\{\s*browser:/);
});
