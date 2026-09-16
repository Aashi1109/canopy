import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("admin list filter URLs survive reloads and history navigation", async ({ page, baseURL }) => {
  await new AuthPage(page).signIn(
    E2E_ACCOUNTS.admin.email,
    E2E_PASSWORD,
    new URL("/admin/templates?query=Invoice&query=ignored&type=invoice&status=draft&mode=advanced", baseURL).href,
  );
  await expect(page.getByLabel("Search templates")).toHaveValue("Invoice");
  await expect(page.getByRole("combobox", { name: "Document type" })).toHaveText("Invoice");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveText("Draft");
  await expect(page.getByRole("combobox", { name: "Editor", exact: true })).toHaveText("Advanced");
  await page.reload();
  await expect(page.getByLabel("Search templates")).toHaveValue("Invoice");

  await page.getByLabel("Search templates").fill("Receipt");
  await expect(page).toHaveURL((url) => url.searchParams.get("query") === "Receipt");
  await expect(page.getByLabel("Search templates")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveText("Draft");
  await page.getByRole("combobox", { name: "Editor", exact: true }).click();
  await page.getByRole("option", { name: "Standard", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("query") === "Receipt" &&
      url.searchParams.get("mode") === "standard" &&
      url.searchParams.get("type") === "invoice" &&
      url.searchParams.get("status") === "draft",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/templates" && !url.search);
  await expect(page.getByLabel("Search templates")).toHaveValue("");
  await expect(page.getByLabel("Search templates")).toBeFocused();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Document type" })).toHaveText("All document types");
  await page.goBack();
  await expect(page.getByLabel("Search templates")).toHaveValue("Receipt");
  await expect(page.getByRole("combobox", { name: "Editor", exact: true })).toHaveText("Standard");
  await page.goForward();
  await expect(page.getByLabel("Search templates")).toHaveValue("");
  await page.getByLabel("Search templates").fill("temporary draft");
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Search templates")).toHaveValue("");
  await expect(page.getByLabel("Search templates")).toBeFocused();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();

  await page.goto("/admin/templates?query=Invoice&type=invalid&status=invalid&mode=invalid");
  await expect(page.getByRole("combobox", { name: "Document type" })).toHaveText("All document types");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveText("All statuses");
  await expect(page.getByRole("combobox", { name: "Editor", exact: true })).toHaveText("Standard + advanced");

  await page.goto("/admin/users?q=E2E&role=admin");
  const userSearch = page.getByLabel("Search", { exact: true });
  const role = page.getByRole("combobox", { name: "Role", exact: true });
  const reset = page.getByRole("button", { name: "Reset", exact: true });
  await expect(userSearch).toHaveValue("E2E");
  await expect(role).toHaveText("Admin");
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
  const accounts = page.getByRole("region", { name: "User accounts" });
  await expect(accounts.getByText(E2E_ACCOUNTS.admin.email, { exact: true })).toBeVisible();
  await expect(accounts.getByText(E2E_ACCOUNTS.user.email, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(userSearch).toHaveValue("E2E");
  await expect(role).toHaveText("Admin");
  await reset.click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/users" && !url.search);
  await expect(userSearch).toHaveValue("");
  await expect(userSearch).toBeFocused();
  await expect(role).toHaveText("All roles");
  await expect(reset).toBeDisabled();
  await expect(accounts.getByText(E2E_ACCOUNTS.user.email, { exact: true })).toBeVisible();

  await userSearch.fill(E2E_ACCOUNTS.user.email);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === E2E_ACCOUNTS.user.email);
  await expect(userSearch).toBeFocused();
  await expect(accounts.getByText(E2E_ACCOUNTS.user.email, { exact: true })).toBeVisible();
  await expect(accounts.getByText(E2E_ACCOUNTS.admin.email, { exact: true })).toHaveCount(0);
  await role.click();
  await page.getByRole("option", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === E2E_ACCOUNTS.user.email && url.searchParams.get("role") === "admin",
  );
  await expect(page.getByText("No users matched", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(role).toHaveText("All roles");
  await expect(userSearch).toHaveValue(E2E_ACCOUNTS.user.email);
  await expect(accounts.getByText(E2E_ACCOUNTS.user.email, { exact: true })).toBeVisible();
  await page.goForward();
  await expect(role).toHaveText("Admin");
  await expect(page.getByText("No users matched", { exact: true })).toBeVisible();
  await reset.click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/users" && !url.search);
  await page.reload();
  await expect(userSearch).toHaveValue("");
  await expect(role).toHaveText("All roles");
  await expect(reset).toBeDisabled();

  await page.goto("/admin/audit?q=E2E&date=7");
  const dateRange = page.getByRole("combobox", { name: "Date range" });
  await expect(dateRange).toHaveText("Last 7 days");
  await expect(page.getByLabel("Search events")).toHaveValue("E2E");
  await page.getByLabel("Search events").fill("role");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "role" && url.searchParams.get("date") === "7");
  await expect(page.getByLabel("Search events")).toBeFocused();
  await dateRange.click();
  await page.getByRole("option", { name: "Last 90 days" }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "role" && url.searchParams.get("date") === "90");
  await expect(dateRange).toHaveText("Last 90 days");
  await page.goBack();
  await expect(dateRange).toHaveText("Last 7 days");
  await expect(page.getByLabel("Search events")).toHaveValue("role");
  await page.goForward();
  await expect(dateRange).toHaveText("Last 90 days");
  await expect(page.getByLabel("Search events")).toHaveValue("role");
  await page.reload();
  await expect(dateRange).toHaveText("Last 90 days");
  await reset.click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin/audit" && !url.search);
  await expect(page.getByLabel("Search events")).toHaveValue("");
  await expect(page.getByLabel("Search events")).toBeFocused();
  await expect(dateRange).toHaveText("Last 30 days");
  await expect(page.getByRole("combobox", { name: "Action", exact: true })).toHaveText("All actions");
  await expect(reset).toBeDisabled();
  await page.reload();
  await expect(dateRange).toHaveText("Last 30 days");
  await expect(reset).toBeDisabled();
  await page.goto("/admin/audit?action=template.archive");
  await expect(page.getByRole("combobox", { name: "Action", exact: true })).toHaveText("Archived template");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Action", exact: true })).toHaveText("Archived template");
  await page.goto("/admin/audit?date=invalid&action=invalid");
  await expect(dateRange).toHaveText("Last 30 days");
  await expect(page.getByRole("combobox", { name: "Action", exact: true })).toHaveText("Invalid");
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("catalog suites and quick views are mutually exclusive across URLs and history", async ({ page, baseURL }) => {
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, new URL("/admin/tools?q=pdf", baseURL).href);
  const rail = page.getByRole("complementary", { name: "Catalog views" });
  const suite = page.getByRole("combobox", { name: "Suite", exact: true });
  const visibility = page.getByRole("combobox", { name: "Visibility", exact: true });
  const media = rail.getByRole("button", { name: /^Media tools\b/ });
  const hidden = rail.getByRole("button", { name: /^Hidden\b/ });
  const allTools = rail.getByRole("button", { name: /^All tools\b/ });

  await media.click();
  await expect(page).toHaveURL((url) => url.searchParams.get("app") === "media" && !url.searchParams.has("visibility"));
  await expect(media).toHaveAttribute("aria-pressed", "true");
  await hidden.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("visibility") === "hidden" &&
      !url.searchParams.has("app") &&
      !url.searchParams.has("category") &&
      url.searchParams.get("q") === "pdf",
  );
  await expect(suite).toHaveText("All suites");
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await expect(media).toHaveAttribute("aria-pressed", "false");
  await expect(allTools).toHaveAttribute("aria-pressed", "false");
  await expect(rail.getByRole("button", { pressed: true })).toHaveCount(1);
  await page.reload();
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(media).toHaveAttribute("aria-pressed", "true");
  await expect(visibility).toHaveText("Any status");
  await page.goForward();
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Search tools", { exact: true })).toHaveValue("pdf");

  await suite.click();
  await page.getByRole("option", { name: "Developer tools", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("app") === "devtools" &&
      !url.searchParams.has("visibility") &&
      url.searchParams.get("q") === "pdf",
  );
  await expect(visibility).toHaveText("Any status");
  await expect(hidden).toHaveAttribute("aria-pressed", "false");
  await visibility.click();
  await page.getByRole("option", { name: "Drafts", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("visibility") === "draft" && !url.searchParams.has("app"));
  await expect(suite).toHaveText("All suites");
  await expect(allTools).toHaveAttribute("aria-pressed", "false");

  await page.goto("/admin/tools?app=media&visibility=hidden&category=PDF&q=pdf");
  await expect(suite).toHaveText("All suites");
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await expect(allTools).toHaveAttribute("aria-pressed", "false");
  await expect(rail.getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Tool type", exact: true })).toHaveCount(0);
  await media.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("app") === "media" &&
      !url.searchParams.has("visibility") &&
      !url.searchParams.has("category") &&
      url.searchParams.get("q") === "pdf",
  );
  await page.goBack();
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await expect(suite).toHaveText("All suites");
  await page.reload();
  await expect(hidden).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Search tools", { exact: true })).toHaveValue("pdf");
});
