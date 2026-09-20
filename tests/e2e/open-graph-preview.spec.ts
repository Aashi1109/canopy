import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

import type { ToolLinkPreviewRender } from "../../lib/tool-framework/result";

const SCAN_ENDPOINT = "**/api/tools/open-graph-preview";
const SHARING_IMAGE = {
  url: "https://images.example.test/sharing.png",
  previewUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA1EAAAAASUVORK5CYII=",
  alt: "Fetched sharing artwork",
  width: 1200,
  height: 630,
};

function scannedPage(url: string, title = "Fetched product page"): ToolLinkPreviewRender {
  return {
    render: "link-preview",
    requestedUrl: url,
    resolvedUrl: "https://example.com/product",
    metadata: {
      url: "https://example.com/product",
      title,
      description: "Metadata fetched from the page, without manual entry.",
      siteName: "Example Studio",
      image: SHARING_IMAGE,
      twitter: {
        card: "summary_large_image",
        title: "A title specifically for X",
        description: "The page supplies a separate X description.",
        image: SHARING_IMAGE,
      },
    },
    tags: [
      '<meta property="og:title" content="Fetched &amp; safe &lt;img src=x onerror=&quot;window.ogInjected=true&quot;&gt;">',
      '<meta property="og:description" content="Metadata fetched from the page, without manual entry.">',
      '<meta property="og:url" content="https://example.com/product">',
      '<meta name="twitter:title" content="A title specifically for X">',
    ].join("\n"),
    checks: [
      { level: "ok", property: "og:title", label: "Title found", detail: "The page declares an Open Graph title." },
      { level: "ok", property: "og:image", label: "Sharing image found", detail: "A sharing image was fetched." },
    ],
    downloadName: "open-graph-tags.html",
  };
}

async function openScanner(page: Page) {
  await page.goto("http://localhost:3000/devtools/open-graph-preview", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Save Open Graph Preview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan URL", exact: true })).toBeVisible();
  return page.getByRole("textbox", { name: "Website URL (required)", exact: true });
}

async function fulfillScan(route: Route, result: ToolLinkPreviewRender) {
  await route.fulfill({ json: { result } });
}

test("invalid website input stays inline and bare domains can be scanned", async ({ page }) => {
  const requests: string[] = [];
  await page.route(SCAN_ENDPOINT, (route) => {
    const url = route.request().postDataJSON().text;
    requests.push(url);
    return fulfillScan(route, scannedPage(url, "Scanned bare domain"));
  });
  const input = await openScanner(page);
  const scan = page.getByRole("button", { name: "Scan URL", exact: true });
  await input.fill("not a website");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAccessibleDescription(/Enter a valid public/);
  await expect(scan).toBeDisabled();
  await input.press("Enter");
  expect(requests).toEqual([]);

  await input.fill("slack.com");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect(input).not.toHaveAccessibleDescription(/Enter a valid public/);
  await expect(scan).toBeEnabled();
  await scan.click();
  await expect(page.getByRole("tabpanel", { name: "Facebook", exact: true })).toContainText("Scanned bare domain");
  expect(requests).toHaveLength(1);
});

test("scanning fetched metadata provides platform previews and safe HTML export", async ({ context, page }) => {
  const url = "https://example.com/redirect";
  const result = scannedPage(url);
  let response = result;
  const requests: string[] = [];
  const directImageRequests: string[] = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });
  await page.route("https://images.example.test/**", (route) => {
    directImageRequests.push(route.request().url());
    return route.abort();
  });
  await page.route(SCAN_ENDPOINT, (route) => {
    requests.push(route.request().postDataJSON().text);
    return fulfillScan(route, response);
  });

  const input = await openScanner(page);
  await input.fill(url);
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  const facebook = page.getByRole("tabpanel", { name: "Facebook", exact: true });
  await expect(facebook).toContainText(result.metadata.title);
  await expect(facebook).toContainText(result.metadata.description);
  await expect(facebook.getByRole("img", { name: "Fetched sharing artwork", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rescan", exact: true })).toBeEnabled();
  const inspector = page.getByRole("region", { name: "Metadata inspector", exact: true });
  await expect(inspector).toContainText(result.resolvedUrl);
  await expect(inspector).toContainText(result.requestedUrl);
  await expect(inspector.getByRole("list", { name: "Metadata checks" })).toContainText("Title found");
  await page.screenshot({ path: `/tmp/canopy-open-graph-scanner-${page.viewportSize()!.width}.png` });

  await page.getByRole("tab", { name: "X", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "X", exact: true })).toContainText(result.metadata.twitter.title);
  await expect(page.getByRole("tabpanel", { name: "X", exact: true })).not.toContainText(result.metadata.title);
  await page.getByRole("tab", { name: "LinkedIn", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "LinkedIn", exact: true })).toContainText(result.metadata.title);
  await expect(page.getByRole("tabpanel", { name: "LinkedIn", exact: true })).not.toContainText(
    result.metadata.description,
  );
  for (const platform of ["WhatsApp", "Discord"]) {
    await page.getByRole("tab", { name: platform, exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: platform, exact: true })).toContainText(result.metadata.title);
  }
  expect(requests).toEqual([url]);

  const unsafeTitle = 'Fetched & safe <img src=x onerror="window.ogInjected=true">';
  response = { ...result, metadata: { ...result.metadata, title: unsafeTitle } };
  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Facebook", exact: true })).toContainText(unsafeTitle);
  expect(requests).toEqual([url, url]);

  await page.getByRole("tab", { name: "HTML tags", exact: true }).click();
  const source = page.getByRole("textbox", { name: "Fetched HTML tags", exact: true });
  await expect(source).toHaveJSProperty("readOnly", true);
  await expect(source).toHaveValue(result.tags);
  expect(await page.evaluate(() => (window as Window & { ogInjected?: boolean }).ogInjected)).toBeUndefined();
  await page.getByRole("button", { name: "Copy all", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(result.tags);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .html", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("open-graph-tags.html");
  const file = await download.path();
  expect(file).not.toBeNull();
  expect(await readFile(file!, "utf8")).toBe(result.tags);
  expect(directImageRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("missing metadata and unavailable images show actionable checks and preview fallbacks", async ({ page }) => {
  const url = "https://example.com/incomplete";
  const missing = scannedPage(url);
  const incomplete: ToolLinkPreviewRender = {
    ...missing,
    metadata: { ...missing.metadata, url: "", title: "", description: "", image: null },
    checks: [
      { level: "ok", property: "og:site_name", label: "Site name found", detail: "The page declares its site name." },
      { level: "warn", property: "og:description", label: "Description missing", detail: "Add an og:description tag." },
      { level: "error", property: "og:title", label: "Title missing", detail: "Add an og:title tag to the page." },
      { level: "ok", property: "twitter:card", label: "X card found", detail: "The page declares an X card type." },
      { level: "error", property: "og:url", label: "URL missing", detail: "Add an og:url tag to the page." },
      { level: "warn", property: "og:image", label: "Sharing image missing", detail: "Add a public sharing image." },
    ],
  };
  let response = incomplete;
  await page.route(SCAN_ENDPOINT, (route) => fulfillScan(route, response));
  const input = await openScanner(page);
  await input.fill(url);
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  const preview = page.getByRole("tabpanel", { name: "Facebook", exact: true });
  await expect(preview).toContainText("No title found");
  await expect(preview).toContainText("No sharing image found");
  const inspector = page.getByRole("region", { name: "Metadata inspector", exact: true });
  await expect(inspector).toContainText("2 warnings");
  await expect(inspector).toContainText("Add an og:title tag to the page.");
  await expect(inspector.getByRole("list", { name: "Metadata checks" }).getByRole("listitem")).toHaveText([
    /Title missing/,
    /URL missing/,
    /Description missing/,
    /Sharing image missing/,
    /Site name found/,
    /X card found/,
  ]);

  response = { ...missing, metadata: { ...missing.metadata, image: { ...SHARING_IMAGE, previewUrl: null } } };
  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect(preview).toContainText("Image preview unavailable");
  response = {
    ...missing,
    metadata: { ...missing.metadata, image: { ...SHARING_IMAGE, previewUrl: "data:image/png;base64,broken" } },
  };
  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect(preview).toContainText("Image preview unavailable");
  await expect(preview).toContainText(missing.metadata.title);
});

test("scan errors let the user edit the URL and retry successfully", async ({ page }) => {
  let attempts = 0;
  await page.route(SCAN_ENDPOINT, (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({
          status: 400,
          json: {
            error: {
              code: "fetch-failed",
              message: "The page could not be fetched.",
              recovery: "Check the URL and try again.",
            },
          },
        })
      : fulfillScan(route, scannedPage(route.request().postDataJSON().text, "Recovered page"));
  });
  const input = await openScanner(page);
  await input.fill("https://example.com/failing");
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Could not scan this page", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit URL", exact: true }).click();
  await expect(input).toBeFocused();
  await input.fill("https://example.com/recovered");
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Facebook", exact: true })).toContainText("Recovered page");
  expect(attempts).toBe(2);
});

test("cancelled scans cannot replace a later result or restore output after Reset", async ({ page }) => {
  const pending: Route[] = [];
  await page.route(SCAN_ENDPOINT, (route) => {
    pending.push(route);
  });
  const input = await openScanner(page);
  await input.fill("https://example.com/slow");
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  await expect.poll(() => pending.length).toBe(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(input).toBeEnabled();
  expect(pending).toHaveLength(1);
  await input.fill("https://example.com/latest");
  await page.getByRole("button", { name: "Scan URL", exact: true }).click();
  await expect.poll(() => pending.length).toBe(2);
  await fulfillScan(pending[1], scannedPage("https://example.com/latest", "Latest page"));
  const preview = page.getByRole("tabpanel", { name: "Facebook", exact: true });
  await expect(preview).toContainText("Latest page");
  // An aborted browser request may already be disposed when its delayed server response arrives.
  await fulfillScan(pending[0], scannedPage("https://example.com/slow", "Stale page")).catch(() => undefined);
  await expect(preview).toContainText("Latest page");
  await expect(preview).not.toContainText("Stale page");

  await page.getByRole("button", { name: "Rescan", exact: true }).click();
  await expect.poll(() => pending.length).toBe(3);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await fulfillScan(pending[2], scannedPage("https://example.com/latest", "Reset stale page")).catch(() => undefined);
  await expect(input).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Preview a shared link", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Facebook", exact: true })).toHaveCount(0);
});
