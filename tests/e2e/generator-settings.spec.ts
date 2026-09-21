import { expect, test, type Page } from "@playwright/test";

async function openMetaGenerator(page: Page) {
  await page.goto("http://localhost:3000/devtools/meta-tag-generator", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Paste into Page title", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Settings preview");
  await page
    .getByRole("textbox", { name: "Meta description", exact: true })
    .fill("Generated tags reflect the current settings.");
  await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
}

test("Meta Tag Generator requires Generate initially, after input replacement, and after Reset", async ({ page }) => {
  await openMetaGenerator(page);
  await page.clock.install();
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  const canonical = page.getByRole("textbox", { name: "Canonical URL", exact: true });
  await canonical.fill("https://example.com/before-first-run");
  await page.getByRole("switch", { name: "Include Twitter card", exact: true }).click();
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate meta tags", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveText(/twitter:card/);
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Replacement title");
  await canonical.fill("https://example.com/replacement");
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveText(/<title>Replacement title<\/title>/);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(output).toHaveCount(0);
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Reset title");
  await page
    .getByRole("textbox", { name: "Meta description", exact: true })
    .fill("A new generation still needs the Generate action.");
  await canonical.fill("https://example.com/after-reset");
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveText(/https:\/\/example\.com\/after-reset/);
});

test("Meta Tag Generator refreshes existing output after toggles and keeps the latest rapid settings", async ({
  page,
}) => {
  await openMetaGenerator(page);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  await expect(output).toHaveText(/og:title/);
  await page.getByRole("switch", { name: "Include Open Graph", exact: true }).click();
  await expect(output).toHaveText(/<title>Settings preview<\/title>/);
  await expect(output).not.toHaveText(/og:title/);
  await page.getByRole("switch", { name: "Include Twitter card", exact: true }).click();
  await expect(output).toHaveText(/twitter:card/);

  const canonical = page.getByRole("textbox", { name: "Canonical URL", exact: true });
  for (const suffix of ["draft", "revised", "latest"]) {
    await canonical.fill(`https://example.com/${suffix}`);
  }
  await expect(output).toHaveText(/href="https:\/\/example\.com\/latest"/);
  await expect(output).not.toHaveText(/https:\/\/example\.com\/(draft|revised)/);

  const lastSuccessfulOutput = await output.innerText();
  await canonical.fill("/invalid-relative-url");
  await expect(page.getByTestId("tool-status-line")).toContainText(
    "Canonical URL must be an absolute http or https URL.",
  );
  await expect(output).toHaveText(lastSuccessfulOutput);
  await canonical.fill("https://example.com/recovered");
  await expect(output).toHaveText(/href="https:\/\/example\.com\/recovered"/);
});

test("Meta Tag Generator retains existing output while a settings refresh is pending", async ({ page }) => {
  await openMetaGenerator(page);
  const canonical = page.getByRole("textbox", { name: "Canonical URL", exact: true });
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  await canonical.fill("https://example.com/original");
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveText(/href="https:\/\/example\.com\/original"/);
  const previousOutput = await output.innerText();

  const now = new Date("2026-09-21T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(new Date(now.getTime() + 1_000));
  await canonical.fill("https://example.com/pending");
  await expect(output).toHaveText(previousOutput);
  await canonical.fill("https://example.com/latest");
  await expect(output).toHaveText(previousOutput);
  await page.clock.runFor(1_000);
  await expect(output).toHaveText(/href="https:\/\/example\.com\/latest"/);
  await expect(output).not.toHaveText(/href="https:\/\/example\.com\/pending"/);
});

test("Meta Tag Generator still requires Generate after a first-run failure", async ({ page }) => {
  await openMetaGenerator(page);
  const canonical = page.getByRole("textbox", { name: "Canonical URL", exact: true });
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  await canonical.fill("/invalid-relative-url");
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(page.getByTestId("tool-status-line")).toContainText("Canonical URL must be an absolute");

  await page.clock.install();
  await canonical.fill("https://example.com/first-success");
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveText(/href="https:\/\/example\.com\/first-success"/);
});

test("Random Number Generator updates an existing list when the requested count changes", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/random-number-generator", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Random Number Generator", level: 1, exact: true })).toBeVisible();
  await page.clock.install();
  const count = page.getByRole("spinbutton", { name: "How many", exact: true });
  const result = page.getByRole("region", { name: "Result", exact: true });
  await count.fill("2");
  await page.clock.runFor(1_000);
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(2);
  await count.fill("4");
  await page.clock.runFor(1_000);
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(4);
});

test("UUID Generator outside Developer Generators refreshes settings only after its first output", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/uuid-generator", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "UUID Generator", level: 1, exact: true })).toBeVisible();
  await page.clock.install();
  const count = page.getByRole("spinbutton", { name: "How many", exact: true });
  const result = page.getByRole("region", { name: "Result", exact: true });
  await count.fill("2");
  await page.clock.runFor(1_000);
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(2);
  await count.fill("4");
  await page.clock.runFor(1_000);
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(4);
});

test("Bcrypt settings refresh can be cancelled without losing its output or accepting a late result", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/devtools/bcrypt-generator", { waitUntil: "commit" });
  await page.getByLabel("Password or text (required)", { exact: true }).fill("refresh-test-value");
  await page.getByRole("button", { name: "Restore settings panel", exact: true }).click();
  const rounds = page.getByRole("spinbutton", { name: "Cost rounds", exact: true });
  const result = page.getByRole("region", { name: "Bcrypt hash", exact: true });
  const hash = result.getByText(/^\$2b\$\d{2}\$/);
  await rounds.fill("4");
  await page.getByRole("button", { name: "Generate bcrypt hash", exact: true }).click();
  await expect(result).toContainText(/\$2b\$04\$/);
  const originalHash = await hash.innerText();

  await rounds.fill("14");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(result).toContainText(/\$2b\$04\$/);
  // Let the debounce expire and the asynchronous high-cost hash start before cancelling.
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(hash).toHaveText(originalHash);
  await expect(page.getByTestId("tool-status-line")).toContainText(/cancelled/i);

  await rounds.fill("5");
  await expect(result).toContainText(/\$2b\$05\$/);
  const latestHash = await hash.innerText();
  // bcrypt does not abort its calculation; its old promise can resolve after cancellation.
  await page.waitForTimeout(6_000);
  await expect(hash).toHaveText(latestHash);
  await expect(result).not.toContainText(/\$2b\$14\$/);
});
