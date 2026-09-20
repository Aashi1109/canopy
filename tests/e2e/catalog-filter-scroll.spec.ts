import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 1366, height: 768 } });

async function expectListingInViewport(page: Page, heading: string) {
  const listingHeading = page.getByRole("heading", { name: heading, exact: true });
  await expect(listingHeading).toBeInViewport();
  await expect.poll(() => listingHeading.evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
]) {
  test.describe(`filtered catalog landing at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    for (const { route, category, heading } of [
      { route: "devtools", category: "developer-generators", heading: "Developer Generators" },
      { route: "media", category: "image-editing", heading: "Search results" },
    ]) {
      test(`${route} category link opens at the listing`, async ({ page }) => {
        await page.goto(`/${route}?category=${category}`, { waitUntil: "commit" });
        await expectListingInViewport(page, heading);
        if (viewport.width === 1366) {
          await page.screenshot({ path: `/tmp/canopy-${route}-filtered-${viewport.width}.png` });
        }
      });
    }
  });
}

for (const route of ["devtools", "media"]) {
  test(`${route} search and empty results open at the listing with recovery available`, async ({ page }) => {
    const heading = route === "devtools" ? "Search Results" : "Search results";
    const category = route === "devtools" ? "developer-generators" : "image-editing";
    for (const search of ["?q=pdf", `?category=${category}&q=generator`]) {
      await page.goto(`/${route}${search}`, { waitUntil: "commit" });
      await expectListingInViewport(page, heading);
    }

    await page.goto(`/${route}?q=unmatched-catalog-search-123456789`, { waitUntil: "commit" });
    await expectListingInViewport(page, heading);
    await expect(page.getByRole("heading", { name: /^No (available|enabled) tools found$/ })).toBeInViewport();
    await page.getByRole("link", { name: "Browse all tools", exact: true }).click();
    await expect(page).toHaveURL(`/${route}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`${route} unfiltered and ignored filter URLs keep the normal landing position`, async ({ page }) => {
    for (const search of ["", "?q=%20%20&category=", "?category=not-a-category", "?view=all"]) {
      await page.goto(`/${route}${search}`, { waitUntil: "commit" });
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    }
  });
}

test("changing a developer category returns the new listing to view", async ({ page }) => {
  await page.goto("/devtools?category=developer-generators", { waitUntil: "commit" });
  await expectListingInViewport(page, "Developer Generators");
  await page.evaluate(() => window.scrollBy({ top: 180, behavior: "instant" }));
  await page.getByRole("combobox", { name: "Filter tools by category" }).click();
  await page.getByRole("option", { name: "JSON Tools", exact: true }).click();
  await expect(page).toHaveURL(/category=json-tools/);
  await expectListingInViewport(page, "JSON Tools");
});

for (const { route, category, label, heading, tool } of [
  {
    route: "devtools",
    category: "developer-generators",
    label: "Developer Generators",
    heading: "Developer Generators",
    tool: "api-key-generator",
  },
  {
    route: "media",
    category: "image-editing",
    label: "Image Editing",
    heading: "Search results",
    tool: "compress-image",
  },
]) {
  test(`${route} category label URLs show the same filtered listing as category keys`, async ({ page }) => {
    await page.goto(`/${route}?category=${category}`, { waitUntil: "commit" });
    await expectListingInViewport(page, heading);
    const toolLinks = page.locator(`main a[href^="/${route}/"]`);
    const expectedLinks = await toolLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(expectedLinks.length).toBeGreaterThan(0);

    await page.goto(`/${route}?category=${encodeURIComponent(label)}`, { waitUntil: "commit" });
    await expectListingInViewport(page, heading);
    await expect(toolLinks).toHaveCount(expectedLinks.length);
    expect(await toolLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(
      expectedLinks,
    );
    await page.screenshot({ path: `/tmp/canopy-${route}-category-label-1366.png` });
  });

  test(`${route} tool breadcrumb returns to its canonical filtered category`, async ({ page }) => {
    await page.goto(`/${route}/${tool}`, { waitUntil: "commit" });
    const categoryLink = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", {
      name: label,
      exact: true,
    });
    await expect(categoryLink).toHaveAttribute("href", `/${route}?category=${category}`);
    await categoryLink.click();
    await expect(page).toHaveURL(`/${route}?category=${category}`);
    await expectListingInViewport(page, heading);
  });
}
