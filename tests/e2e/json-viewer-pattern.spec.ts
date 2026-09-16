import { expect, test } from "@playwright/test";

test("JSON result controls disable without a result and recover with valid input", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });
  const input = page.getByRole("textbox", { name: "JSON input", exact: true });
  const result = page.getByTestId("json-result-renderer");
  const view = result.locator('[aria-label="JSON result view"]');
  await expect(view).toBeDisabled();

  await input.fill('{"name":"Example"}');
  await expect(view).toBeEnabled();
  await view.click();
  await page.getByRole("option", { name: "Tree", exact: true }).click();

  for (const source of ["", '{"broken":}']) {
    await input.fill(source);
    await expect(result.locator("header button:enabled, header input:enabled")).toHaveCount(0);
    await expect(result.locator('[aria-label="Expand all JSON nodes"]')).toBeDisabled();
  }

  await input.fill('{"restored":true}');
  for (const label of [
    "JSON result view",
    "Search JSON result",
    "Expand all JSON nodes",
    "Copy JSON result",
    "Download JSON result",
  ]) {
    await expect(result.locator(`[aria-label="${label}"]`)).toBeEnabled();
  }
});

test("JSON result views can scroll to the final value", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Example", exact: true }).click();
  await page.getByRole("textbox", { name: "JSON input" }).fill(
    JSON.stringify({
      entries: Array.from({ length: 120 }, (_, index) => `Value ${index}`),
      lastEntry: "End of JSON",
    }),
  );
  const result = page.getByTestId("json-result-renderer");
  for (const mode of ["read-only", "form", "tree", "code"]) {
    await result.getByRole("combobox", { name: "JSON result view" }).click();
    await page
      .getByRole("option", {
        name: mode === "read-only" ? "View" : mode[0].toUpperCase() + mode.slice(1),
        exact: true,
      })
      .click();
    if (mode !== "code") {
      await result.getByRole("button", { name: "Expand all JSON nodes" }).click();
    }
    const viewport = result.locator('[data-slot="scroll-area-viewport"]');
    await viewport.hover();
    await page.mouse.wheel(0, 100_000);
    await expect
      .poll(() =>
        viewport.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThanOrEqual(1);
    const last =
      mode === "code"
        ? result.getByText(/"lastEntry": "End of JSON"/)
        : result.getByRole("treeitem", { name: "lastEntry", exact: true });
    const viewportBox = await viewport.boundingBox();
    const lastBox = await last.boundingBox();
    expect(viewportBox).not.toBeNull();
    expect(lastBox).not.toBeNull();
    expect(lastBox!.y).toBeGreaterThanOrEqual(viewportBox!.y);
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(viewportBox!.y + viewportBox!.height);
  }
});

test("JSON Viewer read-only view preserves values and editable Form view", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });
  const input = page.getByRole("textbox", { name: "JSON input" });
  const result = page.getByTestId("json-result-renderer");
  const view = result.getByRole("combobox", { name: "JSON result view" });
  const source = JSON.stringify({
    name: "Example",
    nested: { values: [0, false, null, "", {}, []] },
  });
  await input.fill(source);
  await view.click();
  await page.getByRole("option", { name: "View", exact: true }).click();
  await result.getByRole("button", { name: "Expand all JSON nodes" }).click();
  const values = result.getByRole("tree", { name: "Read-only JSON values" });
  await expect(values).toContainText('"Example"');
  for (const value of ["0", "false", "null", '""', "{0 keys}", "[0 items]"]) {
    await expect(values.getByText(value, { exact: true }).first()).toBeVisible();
  }
  await expect(
    values.locator("input, textarea, select, [contenteditable=true], [role=switch]"),
  ).toHaveCount(0);
  await expect(result.getByRole("group", { name: "JSON edit history" })).toHaveCount(0);
  await expect(
    values.getByRole("button", { name: /Reorder|Delete|Duplicate|Add|Edit|Change/ }),
  ).toHaveCount(0);
  await expect(result.getByRole("button", { name: "Copy JSON result" })).toBeVisible();
  await expect(result.getByRole("button", { name: "Download JSON result" })).toBeVisible();
  await result.getByRole("button", { name: "Collapse all JSON nodes" }).click();
  await expect(values.getByRole("treeitem", { name: "name", exact: true })).toHaveCount(0);
  const search = result.getByRole("searchbox", { name: "Search JSON result" });
  await search.fill("Example");
  await expect(values).toContainText('"Example"');
  await search.fill("missing-value");
  await expect(result.getByRole("status")).toContainText("No keys or values match");
  await search.fill("");
  await expect(input).toHaveValue(source);
  await view.click();
  await page.getByRole("option", { name: "Form", exact: true }).click();
  await result.getByRole("button", { name: "Expand all JSON nodes" }).click();
  const name = result.getByRole("textbox", { name: "Edit name", exact: true });
  await name.fill("Updated");
  await name.press("Enter");
  await view.click();
  await page.getByRole("option", { name: "View", exact: true }).click();
  await expect(values).toContainText('"Updated"');
  await expect(
    values.locator("input, textarea, select, [contenteditable=true], [role=switch]"),
  ).toHaveCount(0);
  await expect(input).toHaveValue(source);
  for (const scalar of ['"root value"', "0", "false", "null", "{}", "[]"]) {
    await input.fill(scalar);
    await expect(result.getByRole("tree", { name: "Read-only JSON values" })).toBeVisible();
    await expect(values).toContainText(
      scalar === "{}" ? "{0 keys}" : scalar === "[]" ? "[0 items]" : scalar,
    );
    await expect(
      values.locator("input, textarea, select, [contenteditable=true], [role=switch]"),
    ).toHaveCount(0);
  }
});

test("JSON Viewer matches the approved split-workbench flow", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:3000",
  });
  await page.addInitScript(() => {
    window.localStorage.removeItem("smarttools:json-viewer:split-size");
  });
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });

  const workbench = page.getByTestId("tool-workspace");
  const toolbar = workbench.getByTestId("tool-action-toolbar");
  const input = workbench.getByRole("textbox", { name: "JSON input" });
  const tree = workbench.getByTestId("json-result-renderer");
  const repair = toolbar.getByRole("button", { name: "Repair & clean" });

  await expect(workbench).toHaveAttribute("data-definition-key", "json-viewer");
  expect(
    await workbench.evaluate((element) => Math.round(element.getBoundingClientRect().height)),
  ).toBe(await page.evaluate(() => window.innerHeight - 72));
  if ((page.viewportSize()?.width ?? 0) <= 1024) {
    const split = workbench.locator('[data-stack="split"]');
    expect(
      await split.evaluate((element) => ({
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
      })),
    ).toMatchObject({
      overflowY: "auto",
    });
    expect(await split.evaluate((element) => element.scrollHeight)).toBeGreaterThan(
      await split.evaluate((element) => element.clientHeight),
    );
  } else {
    const separator = workbench.getByRole("separator", {
      name: "Resize workspace panels",
    });
    const collapsePrimary = workbench.getByRole("button", {
      name: "Collapse primary panel",
    });
    const primaryPane = workbench.locator('[data-split-pane="primary"]');
    await expect(separator).toHaveAttribute("aria-valuenow", "42");
    await expect(collapsePrimary).toBeVisible();
    const initialWidth = await primaryPane.evaluate(
      (element) => element.getBoundingClientRect().width,
    );

    await separator.focus();
    await page.keyboard.press("ArrowRight");
    expect(
      await primaryPane.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThan(initialWidth);

    await collapsePrimary.click();
    await expect(primaryPane).toBeHidden();
    await page.setViewportSize({ height: 844, width: 390 });
    await expect(primaryPane).toBeVisible();
    await page.setViewportSize({ height: 720, width: 1280 });
    await expect(primaryPane).toBeVisible();
  }
  await expect(workbench.locator('[data-purpose="editor"]')).toHaveAttribute("data-state", "ready");
  await expect(workbench.locator('[data-purpose="inspector"]')).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.getByText("JSON TOOL", { exact: true })).toBeVisible();
  await expect(page.getByText("REPAIR & CLEAN", { exact: true })).toBeVisible();
  await expect(page.getByText("PRIVATE IN BROWSER", { exact: true })).toBeVisible();
  await expect(page.getByTestId("tool-workbench-rail")).toHaveCount(0);
  await expect(input).toHaveCSS("font-family", /Geist Mono/);

  for (const action of [
    "Repair & clean",
    "Beautify",
    "Minify",
    "Example",
    "Broken example",
    "Clear",
  ]) {
    await expect(toolbar.getByRole("button", { name: action })).toBeVisible();
  }
  await expect(toolbar.getByRole("combobox", { name: "Repair strategy" })).toBeVisible();
  await expect(input).toHaveValue(/CodeUtilityKit/);
  await expect(tree).toContainText("CodeUtilityKit");
  await expect(tree.getByRole("searchbox", { name: "Search JSON result" })).toBeVisible();
  await expect(tree.getByRole("button", { name: "Copy JSON result" })).toBeVisible();
  await expect(tree.getByRole("button", { name: "Download JSON result" })).toBeVisible();
  const rootNode = tree.getByRole("treeitem", { name: "root" });
  const nameNode = tree.getByRole("treeitem", { name: "name" });
  await expect(rootNode).toHaveAttribute("aria-selected", "true");
  await nameNode.click();
  await expect(nameNode).toHaveAttribute("aria-selected", "true");
  await expect(rootNode).toHaveAttribute("aria-selected", "false");

  const support = page.getByTestId("tool-support");
  await expect(support).toContainText("Know the boundaries");
  await expect(support).toContainText("Your data stays local");
  await expect(support).toContainText("Complete the task safely");
  await expect(support).toContainText("Continue with a related tool");
  expect(
    await support
      .getByRole("navigation", { name: "Related JSON tools" })
      .locator("..")
      .evaluate((element) => ({
        borderBottomWidth: getComputedStyle(element).borderBottomWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
      })),
  ).toEqual({
    borderBottomWidth: "0px",
    borderTopWidth: "0px",
  });

  await input.fill('{"name":}');
  await expect(workbench.getByTestId("tool-status-line")).toContainText("isn't valid");
  await expect(workbench.locator('[data-purpose="editor"] [role="alert"]')).toHaveCount(0);
  await workbench
    .getByTestId("json-result-placeholder")
    .getByRole("button", { name: /Go to JSON error at line/i })
    .click();
  expect(
    await input.evaluate((element: HTMLTextAreaElement) => element.selectionEnd),
  ).toBeGreaterThan(await input.evaluate((element: HTMLTextAreaElement) => element.selectionStart));

  await toolbar.getByRole("button", { name: "Broken example" }).click();
  const brokenInput = '[{"id":1,"name":"Alice","age":},{"id":2,"name":"Bob","age":30}]';
  await repair.click();
  const confirmation = workbench.getByTestId("tool-confirmation-overlay");
  await expect(confirmation).toContainText("Confirm destructive repair");
  await expect(confirmation).toContainText("Removed: $[0].age");
  await expect(input).toHaveValue(brokenInput);
  await expect(confirmation).toHaveAttribute("role", "alertdialog");
  await expect(confirmation).toHaveAttribute("aria-modal", "true");
  const cancelRepair = confirmation.getByRole("button", { name: "Cancel" });
  const applyRepair = confirmation.getByRole("button", {
    name: "Apply repair",
  });
  await expect(cancelRepair).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(applyRepair).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancelRepair).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(repair).toBeFocused();
  await expect(
    page.getByText("Repair cancelled. Input was not changed.", { exact: true }),
  ).toBeVisible();

  const repairStrategy = toolbar.getByRole("combobox", {
    name: "Repair strategy",
  });
  await repairStrategy.click();
  await page.getByRole("option", { name: "Set to null" }).click();
  await repairStrategy.click();
  await page.getByRole("option", { name: "Remove broken" }).click();
  await repair.click();
  await confirmation.getByRole("button", { name: "Apply repair" }).click();
  await expect(input).toHaveValue(brokenInput);
  const treeTab = tree.getByRole("tab", { name: "Tree" });
  const formattedTab = tree.getByRole("tab", { name: "Formatted" });
  await expect(formattedTab).toHaveAttribute("aria-selected", "true");
  await expect(tree.getByRole("tabpanel")).toContainText("Alice");
  expect(
    await Promise.all(
      [treeTab, formattedTab].map((tab) =>
        tab.evaluate((element) => ({
          fontWeight: getComputedStyle(element).fontWeight,
          height: element.getBoundingClientRect().height,
        })),
      ),
    ),
  ).toEqual([
    { fontWeight: "600", height: 46 },
    { fontWeight: "600", height: 46 },
  ]);
  await expect(page.getByText(/JSON repaired with the/)).toBeVisible();

  await toolbar.getByRole("button", { name: "Minify" }).click();
  const minifiedInput = '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob","age":30}]';
  await expect(input).toHaveValue(brokenInput);
  const formattedPanel = tree.getByRole("tabpanel");
  await expect(formattedPanel).toHaveText(minifiedInput);
  expect(
    await formattedPanel.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await tree.getByRole("button", { name: "Copy JSON result" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(minifiedInput);

  const downloadPromise = page.waitForEvent("download");
  await tree.getByRole("button", { name: "Download JSON result" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("smarttools-json-viewer.json");

  await toolbar.getByRole("button", { name: "Clear" }).click();
  await expect(input).toHaveValue("");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(input).toHaveValue(brokenInput);

  await expect(toolbar.getByRole("group", { name: "Viewer layout" })).toHaveCount(0);
  await expect(tree).toBeVisible();

  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toEqual({
    clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
    scrollWidth: await page.evaluate(() => document.documentElement.clientWidth),
  });
});

test("JSON Formatter uses the shared JSON result controls", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-formatter");
  await page.getByRole("button", { name: "Example" }).click();

  const result = page.getByTestId("json-result-renderer");
  const view = result.getByRole("combobox", { name: "JSON result view" });
  await expect(view).toHaveText(/code/i);
  await expect(result.getByRole("button", { name: "Copy JSON result" })).toBeVisible();
  await expect(result.getByRole("button", { name: "Download JSON result" })).toBeVisible();
  await expect(result.getByRole("group", { name: "Tree expansion controls" })).toHaveCount(0);
  await expect(result.getByRole("group", { name: "JSON edit history" })).toHaveCount(0);

  await view.click();
  await page.getByRole("option", { name: "Tree", exact: true }).click();
  await expect(result.getByRole("group", { name: "Tree expansion controls" })).toBeVisible();
  await expect(result.getByRole("group", { name: "JSON edit history" })).toBeVisible();

  await result.getByRole("combobox", { name: "JSON result view" }).click();
  await page.getByRole("option", { name: "Form", exact: true }).click();
  await expect(result.getByRole("tree", { name: "JSON value editor" })).toBeVisible();
});

test("JSON search supports Enter and Shift+Enter with wraparound", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });
  await page
    .getByRole("textbox", { name: "JSON input", exact: true })
    .fill(JSON.stringify({ first: "match", second: "match", third: "match" }));
  const result = page.getByTestId("json-result-renderer");
  const search = result.getByRole("searchbox", { name: "Search JSON result" });
  const counter = result.getByTestId("json-search-control").locator('[aria-live="polite"]');
  for (const mode of ["code", "tree", "form", "read-only"]) {
    await result.getByRole("combobox", { name: "JSON result view" }).click();
    await page
      .getByRole("option", {
        name: mode === "read-only" ? "View" : mode[0].toUpperCase() + mode.slice(1),
        exact: true,
      })
      .click();
    await search.fill("match");
    await expect(counter).toHaveText("1/3");
    await search.press("Enter");
    await expect(counter).toHaveText("2/3");
    await search.press("Shift+Enter");
    await expect(counter).toHaveText("1/3");
    await search.press("Shift+Enter");
    await expect(counter).toHaveText("3/3");
    await search.press("Enter");
    await expect(counter).toHaveText("1/3");
    await expect(search).toBeFocused();
    await search.fill("missing");
    await search.press("Enter");
    await search.press("Shift+Enter");
    await expect(counter).toHaveText("0/0");
    await expect(result.getByRole("button", { name: "Next JSON search match" })).toBeDisabled();
    await search.fill("first");
    await search.press("Enter");
    await search.press("Shift+Enter");
    await expect(counter).toHaveText("1/1");
    await search.fill("");
    await search.press("Enter");
    await expect(counter).toHaveCount(0);
  }
});

test("JSON search highlights exact occurrences and only the active line", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-viewer", { waitUntil: "networkidle" });
  await page
    .getByRole("textbox", { name: "JSON input", exact: true })
    .fill(
      JSON.stringify({
        first: "match match",
        second: "MATCH",
        literal: "a.b [x]",
        escaped: '<tag> "quoted"',
      }),
    );
  const result = page.getByTestId("json-result-renderer");
  const search = result.getByRole("searchbox", { name: "Search JSON result" });
  const code = result.getByRole("tabpanel");
  await expect(code).toContainText('"first": "match match"');
  const source = await code.innerText();
  const marks = code.locator("mark");
  const active = code.locator('mark[data-search-current="true"]');
  const currentLine = code.locator('[data-formatted-current="true"]');
  await search.fill("match");
  await expect(marks).toHaveText(["match", "match", "MATCH"]);
  await expect(currentLine).toHaveCount(1);
  await expect(currentLine).toContainText('"first"');
  await expect(active).toHaveCount(1);
  await expect(marks.nth(0)).toHaveAttribute("data-search-current", "true");
  await search.press("Enter");
  await expect(marks.nth(1)).toHaveAttribute("data-search-current", "true");
  await expect(currentLine).toContainText('"first"');
  await search.press("Enter");
  await expect(active).toHaveText("MATCH");
  await expect(currentLine).toHaveCount(1);
  await expect(currentLine).toContainText('"second"');
  await search.press("Shift+Enter");
  await expect(marks.nth(1)).toHaveAttribute("data-search-current", "true");
  for (const query of ["a.b", "[x]", "<tag>", '\\"quoted\\"', '"first": "match']) {
    await search.fill(query);
    await expect.poll(async () => (await marks.allTextContents()).join("")).toBe(query);
    await expect.poll(() => code.innerText()).toBe(source);
  }
  await search.fill("missing");
  await expect(marks).toHaveCount(0);
  await expect(currentLine).toHaveCount(0);
  await search.fill("");
  await expect(marks).toHaveCount(0);
  await expect.poll(() => code.innerText()).toBe(source);
});
