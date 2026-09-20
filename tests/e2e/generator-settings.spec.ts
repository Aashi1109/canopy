import { expect, test, type Page } from "@playwright/test";

async function openMetaGenerator(page: Page) {
  await page.goto("http://localhost:3000/devtools/meta-tag-generator", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Paste into Page title", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Settings preview");
  await page
    .getByRole("textbox", { name: "Meta description (required)", exact: true })
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
  await expect(output).toHaveValue(/twitter:card/);
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Replacement title");
  await canonical.fill("https://example.com/replacement");
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveValue(/<title>Replacement title<\/title>/);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(output).toHaveCount(0);
  await page.getByRole("textbox", { name: "Page title (required)", exact: true }).fill("Reset title");
  await page
    .getByRole("textbox", { name: "Meta description (required)", exact: true })
    .fill("A new generation still needs the Generate action.");
  await canonical.fill("https://example.com/after-reset");
  await page.clock.runFor(1_000);
  await expect(output).toHaveCount(0);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  await expect(output).toHaveValue(/https:\/\/example\.com\/after-reset/);
});

test("Meta Tag Generator refreshes existing output after toggles and keeps the latest rapid settings", async ({
  page,
}) => {
  await openMetaGenerator(page);
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  await expect(output).toHaveValue(/og:title/);
  await page.getByRole("switch", { name: "Include Open Graph", exact: true }).click();
  await expect(output).toHaveValue(/<title>Settings preview<\/title>/);
  await expect(output).not.toHaveValue(/og:title/);
  await page.getByRole("switch", { name: "Include Twitter card", exact: true }).click();
  await expect(output).toHaveValue(/twitter:card/);

  const canonical = page.getByRole("textbox", { name: "Canonical URL", exact: true });
  for (const suffix of ["draft", "revised", "latest"]) {
    await canonical.fill(`https://example.com/${suffix}`);
  }
  await expect(output).toHaveValue(/href="https:\/\/example\.com\/latest"/);
  await expect(output).not.toHaveValue(/https:\/\/example\.com\/(draft|revised)/);

  await canonical.fill("/invalid-relative-url");
  await expect(page.getByRole("heading", { name: "Unable to create the result", exact: true })).toBeVisible();
  await canonical.fill("https://example.com/recovered");
  await expect(output).toHaveValue(/href="https:\/\/example\.com\/recovered"/);
});

test("Random Number Generator updates an existing list when the requested count changes", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/random-number-generator", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Save Random Number Generator", exact: true })).toBeVisible();
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

test("UUID Generator outside Developer Generators still requires Generate after changing settings", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/devtools/uuid-generator", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Save UUID Generator", exact: true })).toBeVisible();
  await page.clock.install();
  const count = page.getByRole("spinbutton", { name: "How many", exact: true });
  const result = page.getByRole("region", { name: "Result", exact: true });
  await count.fill("2");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(2);
  await count.fill("4");
  await page.clock.runFor(1_000);
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(result.getByRole("button", { name: /^Copy item/ })).toHaveCount(4);
});
