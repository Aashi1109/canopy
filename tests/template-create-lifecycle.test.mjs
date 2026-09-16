import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

  assert.match(list, /href="\/admin\/templates\/new"/);
  assert.match(list, /href="\/admin\/templates\/new\/advanced"/);
  assert.match(list, /href="\/admin\/templates\/import"/);
  assert.match(list, /TableHeader/);
  assert.match(list, /Search templates/);
  assert.match(list, /Document type/);
  assert.doesNotMatch(list, /id="create-template"/);
  assert.doesNotMatch(list, /id="create-advanced-template"/);
  assert.doesNotMatch(list, /popover="auto"/);

  assert.match(standardCreate, /requirePagePermission\("templates", "create"\)/);
  assert.match(standardCreate, /action=\{createTemplateAction\}/);
  assert.match(standardCreate, /name="layoutFamily"/);
  assert.match(standardCreate, /Create template/);
  assert.match(standardCreate, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.match(standardCreate, /A dependable starting point/);

  assert.match(advancedCreate, /requirePagePermission\("templates", "create"\)/);
  assert.match(advancedCreate, /action=\{createAdvancedTemplateAction\}/);
  assert.match(advancedCreate, /name="starter"/);
  assert.match(advancedCreate, /Blank canvas/);

  assert.match(importRoute, /ImportTemplateForm/);
  assert.match(importRoute, /requirePagePermission\("templates", "create"\)/);
  assert.match(manageRoute, /updateTemplateMetadataAction/);
  assert.match(manageRoute, /Open editor/);
  assert.match(manageRoute, /Lifecycle/);

  assert.match(shell, /isFullPageTemplateLifecycle/);
  assert.match(shell, /pathname === "\/admin\/templates\/new"/);
  assert.match(shell, /pathname === "\/admin\/templates\/import"/);
  assert.match(shell, /templates\\\/\[\^\/\]\+\\\/\(\?:advanced\|manage\)/);
  assert.match(shell, /if \(isFullPageTemplateLifecycle\(pathname\)\)/);
  assert.match(layout, /<AdminShell user=\{session\.user\}>/);
});
