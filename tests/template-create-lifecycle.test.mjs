import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const templatesPage = "app/admin/(protected)/templates/page.tsx";
const standardCreatePage = "app/admin/(protected)/templates/new/page.tsx";
const advancedCreatePage = "app/admin/(protected)/templates/new/advanced/page.tsx";
const importPage = "app/admin/(protected)/templates/import/page.tsx";
const managePage = "app/admin/(protected)/templates/[id]/manage/page.tsx";
const adminShell = "app/admin/(protected)/components/AdminShell.tsx";
const adminLayout = "app/admin/(protected)/layout.tsx";

test("template lifecycle uses dedicated full-page routes", async () => {
  const [list, standardCreate, advancedCreate, importRoute, manageRoute, shell, layout] = await Promise.all([
    readFile(templatesPage, "utf8"),
    readFile(standardCreatePage, "utf8"),
    readFile(advancedCreatePage, "utf8"),
    readFile(importPage, "utf8"),
    readFile(managePage, "utf8"),
    readFile(adminShell, "utf8"),
    readFile(adminLayout, "utf8"),
  ]);

  expect(list).toMatch(/href=\{appHref\("\/admin\/templates\/new"\)\}/);
  expect(list).toMatch(/href=\{appHref\("\/admin\/templates\/new\/advanced"\)\}/);
  expect(list).toMatch(/href=\{appHref\("\/admin\/templates\/import"\)\}/);
  expect(list).toMatch(/TableHeader/);
  expect(list).toMatch(/Search templates/);
  expect(list).toMatch(/Document type/);
  expect(list).not.toMatch(/id="create-template"/);
  expect(list).not.toMatch(/id="create-advanced-template"/);
  expect(list).not.toMatch(/popover="auto"/);

  expect(standardCreate).toMatch(/requirePagePermission\("templates", "create"\)/);
  expect(standardCreate).toMatch(/action=\{createTemplateAction\}/);
  expect(standardCreate).toMatch(/name="layoutFamily"/);
  expect(standardCreate).toMatch(/Create template/);
  expect(standardCreate).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  expect(standardCreate).toMatch(/A dependable starting point/);

  expect(advancedCreate).toMatch(/requirePagePermission\("templates", "create"\)/);
  expect(advancedCreate).toMatch(/action=\{createAdvancedTemplateAction\}/);
  expect(advancedCreate).toMatch(/name="starter"/);
  expect(advancedCreate).toMatch(/Blank canvas/);

  expect(importRoute).toMatch(/ImportTemplateForm/);
  expect(importRoute).toMatch(/requirePagePermission\("templates", "create"\)/);
  expect(manageRoute).toMatch(/updateTemplateMetadataAction/);
  expect(manageRoute).toMatch(/Open editor/);
  expect(manageRoute).toMatch(/Lifecycle/);

  expect(shell).toMatch(/isFullPageTemplateLifecycle/);
  expect(shell).toMatch(/pathname === "\/admin\/templates\/new"/);
  expect(shell).toMatch(/pathname === "\/admin\/templates\/import"/);
  expect(shell).toMatch(/templates\\\/\[\^\/\]\+\\\/\(\?:advanced\|manage\)/);
  expect(shell).toMatch(/if \(isFullPageTemplateLifecycle\(pathname\)\)/);
  expect(layout).toMatch(/<AdminShell user=\{session\.user\}/);
});
