import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

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

  expect(route).toMatch(/requirePagePermission\("templates", "view"\)/);
  expect(route).toMatch(/layoutFamily !== "advanced"/);
  expect(route).toMatch(/AdvancedTemplateEditor/);

  expect(editor).toMatch(/import\("@pdfme\/ui"\)/);
  expect(editor).toMatch(/import\("@pdfme\/schemas"\)/);
  expect(editor).toMatch(/import\("@pdfme\/generator"\)/);
  expect(editor).toMatch(/onChangeTemplate/);
  expect(editor).toMatch(/\.destroy\(\)/);
  expect(editor).toMatch(/updateTemplateAction/);
  expect(editor).toMatch(/updateAndPublishTemplateAction/);
  expect(editor).toMatch(/resizeAdvancedTemplateConfig/);
  expect(editor).toMatch(/aria-label="Page size"/);
  expect(editor).toMatch(/pageFormat:\s*pageFormat/);
  expect(editor).toMatch(/\n\s+Preview\n/);
  expect(editor).toMatch(/propPanel\.defaultSchema/);
  expect(editor).toMatch(/Add elements/);
  expect(editor).toMatch(/Dynamic text/);
  expect(editor).toMatch(/QR code/);
  expect(editor).toMatch(/aria-label="Template canvas"/);
  expect(editor).toMatch(/aria-label="Fit canvas"/);
  expect(editor).toMatch(/aria-label="Previous page"/);
  expect(editor).toMatch(/aria-label="Designer tools"/);
  expect(editor).toMatch(/data-field-inspector-open/);
  expect(editor).toMatch(/pendingPageRemoval/);
  expect(editor).toMatch(/dialog\.showModal\(\)/);
  expect(editor).toMatch(/Delete page \{pendingPageRemoval \+ 1\}/);
  expect(editor).toMatch(/aria-expanded=\{documentStripOpen\}/);
  expect(editor).toMatch(/aria-pressed=\{activePanel === "pages"\}/);
  expect(editor).toMatch(/Edit on canvas/);
  expect(editor).not.toMatch(/onClick=\{\(\) => removePage\(index\)\}/);
  expect(editor).toMatch(/pdfme-designer-left-sidebar/);
  expect(editor).toMatch(/pdfme-designer-right-sidebar/);
  expect(editor).toMatch(/pdfme-designer-detail-view/);
  expect(editor).toMatch(/sidebarOpen: false/);
  expect(editor).not.toMatch(/sidebarOpen: next === "add"/);
  expect(editor).not.toMatch(/Open design controls/);
  expect(editor).not.toMatch(/function renderInspector/);
  expect(editor).not.toMatch(/Selection inspector/);
  expect(editor).not.toMatch(/Position & size/);
  expect(editor).not.toMatch(/dangerouslySetInnerHTML/);

  expect(list).toMatch(/href=\{appHref\("\/admin\/templates\/new\/advanced"\)\}/);
  expect(list).toMatch(/Create an advanced template/);
  expect(list).not.toMatch(/createAdvancedTemplateAction/);
  expect(createRoute).toMatch(/createAdvancedTemplateAction/);
  expect(createRoute).toMatch(/requirePagePermission\("templates", "create"\)/);
  expect(createRoute).toMatch(/DOCUMENT_DEFINITIONS\.flatMap/);
  expect(createRoute).toMatch(/definition\.allowedPageFormats\.map/);
  expect(createRoute).toMatch(/RECEIPT_80MM: "80 mm receipt"/);
  expect(createRoute).toMatch(/RECEIPT_58MM: "58 mm receipt"/);
  expect(createRoute).toMatch(/Create &amp; open designer/);
  expect(list).toMatch(/\/advanced/);
  expect(config).toMatch(/module:\s*\{\s*browser:/);
});
