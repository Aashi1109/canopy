import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("generated meta tags stay readonly and preserve escaped HTML when copied or downloaded", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" });
  await page.goto("http://localhost:3000/devtools/meta-tag-generator", { waitUntil: "commit" });
  await expect(page.getByRole("button", { name: "Paste into Page title", exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Page title (required)", exact: true })
    .fill('Tools & <img src=x onerror="window.metaTagInjected=true">');
  await page
    .getByRole("textbox", { name: "Meta description (required)", exact: true })
    .fill('Private "utilities" & examples.');
  await page.getByRole("textbox", { name: "Keywords", exact: true }).fill('custom "tools", docs');
  await page.getByRole("textbox", { name: "Author", exact: true }).fill("Editorial & Team");
  await page
    .getByRole("textbox", { name: "Canonical URL", exact: true })
    .fill("https://example.com/custom?source=web&campaign=test");
  await page
    .getByRole("textbox", { name: "Open Graph image URL", exact: true })
    .fill("https://example.com/preview.png?width=1200&height=630");
  await page.getByRole("button", { name: "Generate meta tags", exact: true }).click();
  const resultTab = page.getByRole("tab", { name: "Result", exact: true });
  if (await resultTab.isVisible()) await resultTab.click();

  const title = "Tools &amp; &lt;img src=x onerror=&quot;window.metaTagInjected=true&quot;&gt;";
  const description = "Private &quot;utilities&quot; &amp; examples.";
  const expected = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    '<meta name="keywords" content="custom &quot;tools&quot;, docs">',
    '<meta name="author" content="Editorial &amp; Team">',
    '<link rel="canonical" href="https://example.com/custom?source=web&amp;campaign=test">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    '<meta property="og:url" content="https://example.com/custom?source=web&amp;campaign=test">',
    '<meta property="og:image" content="https://example.com/preview.png?width=1200&amp;height=630">',
  ].join("\n");
  const output = page.getByRole("textbox", { name: "Generated meta tags", exact: true });
  await expect(output).toBeVisible();
  await expect(output).toHaveJSProperty("readOnly", true);
  await expect(output).toHaveValue(expected);
  await output.focus();
  await output.press("ControlOrMeta+A");
  await output.press("Backspace");
  await expect(output).toHaveValue(expected);
  await output.press("ControlOrMeta+A");
  expect(
    await output.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
  ).toBe(expected);
  expect(await page.evaluate(() => (window as Window & { metaTagInjected?: boolean }).metaTagInjected)).toBeUndefined();

  const result = page.getByRole("region", { name: "Result", exact: true });
  await result.getByRole("button", { name: "Copy all", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("button", { name: "Download .html", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("meta-tags.html");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(expected);
});
