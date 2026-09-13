import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const MEDIA_URL = process.env.MEDIA_E2E_URL ?? `${process.env.PLATFORM_E2E_ORIGIN ?? "http://localhost:3000"}/media`;
const CONVERSIONS = [
  ["jpg", "png"], ["png", "jpg"], ["jpg", "webp"], ["png", "webp"],
  ["webp", "jpg"], ["webp", "png"], ["heic", "jpg"], ["heic", "png"],
] as const;
type Format = (typeof CONVERSIONS)[number][number];
const mime = (format: Format) => `image/${format === "jpg" ? "jpeg" : format}`;
const formatLabel = (format: Format) => format === "webp" ? "WebP" : format.toUpperCase();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const previewButton = (scope: Page | Locator, name: string) => scope.getByRole("button", {
  name: new RegExp(`^(?:Open preview of|Preview) ${escaped(name)}$`, "i"),
}).last();

// Same real browser-canvas fixture strategy as media-tools.spec.ts. No worker,
// artifact-store, network, or conversion-result mocks are installed.
async function fixture(page: Page, format: Format, index: number) {
  if (format === "heic") {
    // The repository has no HEIC fixture or encoder. Never relabel JPEG bytes.
    return { name: `source-${index}.heic`, mimeType: mime(format), buffer: await readFile(process.env.MEDIA_E2E_HEIC_FIXTURE!) };
  }
  const bytes = await page.evaluate(async ({ type, index }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96 + index * 16;
    canvas.height = 64 + index * 8;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D unavailable");
    context.fillStyle = index === 1 ? "#ef4444" : "#2563eb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 24, 16);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Fixture encoding failed")), type, 0.9,
    ));
    if (blob.type !== type) throw new Error(`Browser cannot encode ${type}`);
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { type: mime(format), index });
  return { name: `source-${index}.${format}`, mimeType: mime(format), buffer: Buffer.from(bytes) };
}

async function loadedImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) =>
    node.complete && node.naturalWidth > 0 && node.naturalHeight > 0,
  )).toBe(true);
}

async function download(page: Page, control: Locator) {
  const event = page.waitForEvent("download");
  await control.click();
  const file = await event;
  expect(await file.failure()).toBeNull();
  const path = await file.path();
  if (!path) throw new Error("Download did not produce a file");
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}

async function inspectOutput(page: Page, bytes: Uint8Array, format: Format) {
  if (format === "png") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  if (format === "jpg") expect([...bytes.subarray(0, 3)]).toEqual([255, 216, 255]);
  if (format === "webp") {
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("RIFF");
    expect(Buffer.from(bytes.subarray(8, 12)).toString()).toBe("WEBP");
  }
  return page.evaluate(async ({ bytes, type }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type }));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }, { bytes: [...bytes], type: mime(format) });
}

for (const [source, target] of CONVERSIONS) {
  const title = `${formatLabel(source)} to ${formatLabel(target)}`;
  test.describe(title, () => {
    test("initial Add images is keyboard accessible and conversion requires input", async ({ page }) => {
      await page.goto(`${MEDIA_URL}/${source}-to-${target}`);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      const add = page.getByRole("button", { name: new RegExp(`^Add (?:${source.toUpperCase()} )?images\\b`, "i") });
      await expect(add).toBeVisible();
      await expect(page.getByRole("button", { name: `Convert to ${formatLabel(target)}`, exact: true })).toBeDisabled();
      await expect(page.getByRole("heading", { name: "Converted images", exact: true })).toHaveCount(0);
      await add.focus();
      const chooserEvent = page.waitForEvent("filechooser");
      await page.keyboard.press("Enter");
      const chooser = await chooserEvent;
      expect(chooser.isMultiple()).toBe(true);
    });

    test("real previews, removal, artifact downloads, edit and reset complete the batch flow", async ({ page }) => {
      test.skip(source === "heic" && !process.env.MEDIA_E2E_HEIC_FIXTURE,
        "No real HEIC fixture in repository. Set MEDIA_E2E_HEIC_FIXTURE to a valid local HEIC file; no fabricated success.");
      test.setTimeout(120_000);
      await page.goto(`${MEDIA_URL}/${source}-to-${target}`);
      const inputs = await Promise.all([1, 2, 3].map((index) => fixture(page, source, index)));
      const chooserEvent = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: new RegExp(`^Add (?:${source.toUpperCase()} )?images\\b`, "i") }).click();
      await (await chooserEvent).setFiles(inputs);
      await expect(page.getByRole("heading", { name: "Selected images", exact: true })).toBeVisible();
      const inputSizes = [];
      for (const input of inputs) {
        const card = page.getByRole("article").filter({ has: page.getByRole("button", { name: `Remove ${input.name}`, exact: true }) });
        await card.scrollIntoViewIfNeeded();
        const image = card.locator("img");
        await loadedImage(image);
        inputSizes.push(await image.evaluate((node: HTMLImageElement) => ({ width: node.naturalWidth, height: node.naturalHeight })));
        await expect(page.getByRole("button", { name: `Remove ${input.name}`, exact: true })).toBeVisible();
      }
      const sourcePreview = previewButton(page, inputs[0].name);
      await sourcePreview.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await loadedImage(dialog.getByRole("img", { name: inputs[0].name, exact: true }));
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(sourcePreview).toBeFocused();
      await page.getByRole("button", { name: `Remove ${inputs[2].name}`, exact: true }).click();
      await expect(page.getByRole("img", { name: inputs[2].name, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `Remove ${inputs[2].name}`, exact: true })).toHaveCount(0);
      const convert = page.getByRole("button", { name: `Convert to ${formatLabel(target)}`, exact: true });
      await expect(convert).toBeEnabled();
      await convert.click();
      await expect(page.getByRole("heading", { name: "Converted images", exact: true })).toBeVisible({ timeout: 60_000 });
      const gallery = page.getByRole("region", { name: "Generated image previews", exact: true });
      await expect(gallery.getByRole("article")).toHaveCount(2);
      const archive = await download(page, page.getByRole("button", { name: /^Download ZIP\b/ }));
      expect(archive.name).toMatch(/\.zip$/);
      const entries = unzipSync(archive.bytes);
      const names = [1, 2].map((index) => `source-${index}-converted.${target}`);
      expect(Object.keys(entries).sort()).toEqual([...names].sort());
      for (const [index, name] of names.entries()) {
        const card = gallery.getByRole("article").filter({ has: page.getByRole("button", { name: `Download ${name}`, exact: true }) });
        await card.scrollIntoViewIfNeeded();
        const image = card.locator("img");
        await loadedImage(image);
        // Compare rendered pixels with the decoded archive entry. Reading a
        // blob URL with fetch is disallowed by the application's connect CSP.
        const previewMatches = await image.evaluate(async (node: HTMLImageElement, bytes) => {
          const reference = new Image();
          const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]));
          reference.src = url;
          await reference.decode();
          const canvas = document.createElement("canvas");
          canvas.width = reference.naturalWidth;
          canvas.height = reference.naturalHeight;
          const context = canvas.getContext("2d")!;
          context.drawImage(node, 0, 0);
          const shown = context.getImageData(0, 0, canvas.width, canvas.height).data;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(reference, 0, 0);
          const expected = context.getImageData(0, 0, canvas.width, canvas.height).data;
          URL.revokeObjectURL(url);
          return shown.every((value, index) => value === expected[index]);
        }, [...entries[name]]);
        expect(previewMatches).toBe(true);
        expect(await inspectOutput(page, entries[name], target)).toEqual(inputSizes[index]);
        const single = await download(page, gallery.getByRole("button", { name: `Download ${name}`, exact: true }));
        expect(single.name).toBe(name);
        expect(single.bytes).toEqual(Buffer.from(entries[name]));
      }
      const outputPreview = previewButton(gallery, names[0]);
      await outputPreview.click();
      await expect(dialog).toBeVisible();
      await loadedImage(dialog.getByRole("img", { name: names[0], exact: true }));
      const fullScreenDownload = await download(page, dialog.getByRole("button", { name: `Download ${names[0]}`, exact: true }));
      expect(fullScreenDownload.bytes).toEqual(Buffer.from(entries[names[0]]));
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(outputPreview).toBeFocused();

      await page.getByRole("button", { name: "Edit settings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Selected images", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Converted images", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Download ZIP\b/ })).toHaveCount(0);
      for (const input of inputs.slice(0, 2)) await loadedImage(page.getByRole("article").filter({ has: page.getByRole("button", { name: `Remove ${input.name}`, exact: true }) }).locator("img"));
      await expect(page.getByRole("button", { name: `Remove ${inputs[2].name}`, exact: true })).toHaveCount(0);
      await convert.click();
      await expect(page.getByRole("heading", { name: "Converted images", exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(gallery.getByRole("article")).toHaveCount(2);
      await page.getByRole("button", { name: "Convert more", exact: true }).click();
      await expect(page.getByRole("button", { name: new RegExp(`^Add (?:${source.toUpperCase()} )?images\\b`, "i") })).toBeVisible();
      await expect(convert).toBeDisabled();
      await expect(gallery).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Selected images", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Remove source-/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Download ZIP\b/ })).toHaveCount(0);
    });
  });
}


test("PNG settings validation, single-file download and recovery preserve the source", async ({ page }) => {
  await page.goto(`${MEDIA_URL}/png-to-jpg`);
  const input = await fixture(page, "png", 1);
  await page.locator('input[type="file"]').first().setInputFiles(input);
  const convert = page.getByRole("button", { name: "Convert to JPG", exact: true });
  const quality = page.getByRole("spinbutton", { name: "Quality", exact: true });
  await quality.fill("10");
  await expect(convert).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Quality must be between 30 and 100");
  await quality.fill("92");
  const background = page.getByRole("textbox", { name: "Background value", exact: true });
  await background.fill("oops");
  await expect(convert).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("#RRGGBB");
  await background.fill("#335577");
  await expect(convert).toBeEnabled();
  await convert.click();
  const results = page.getByRole("region", { name: "Conversion results", exact: true });
  await expect(results).toBeVisible();
  await expect(page.getByRole("button", { name: /^Download ZIP/ })).toHaveCount(0);
  const output = await download(page, results.getByRole("button", { name: "Download source-1-converted.jpg", exact: true }));
  expect(await inspectOutput(page, output.bytes, "jpg")).toEqual({ width: 112, height: 72 });
  await page.getByRole("button", { name: "Edit settings", exact: true }).click();
  await expect(quality).toHaveValue("92");
  await expect(background).toHaveValue("#335577");
  await expect(page.getByRole("button", { name: "Remove source-1.png", exact: true })).toBeVisible();
  await convert.click();
  await expect(results).toBeVisible();
  await page.getByRole("button", { name: "Convert more", exact: true }).click();
  await expect(quality).toHaveValue("80");
  await expect(background).toHaveValue("#ffffff");
  await expect(convert).toBeDisabled();
});

test("rejected intake and damaged-image failure keep recovery available", async ({ page }) => {
  await page.goto(`${MEDIA_URL}/png-to-jpg`);
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Add PNG images\b/ }).click();
  await (await chooserEvent).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Not an image") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("notes.txt is not an accepted file type");
  const convert = page.getByRole("button", { name: "Convert to JPG", exact: true });
  await expect(convert).toBeDisabled();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "damaged.png", mimeType: "image/png", buffer: Buffer.from("Not valid PNG bytes") });
  await convert.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Conversion failed");
  await expect(convert).toBeEnabled();
  await page.getByRole("button", { name: "Remove damaged.png", exact: true }).click();
  await expect(convert).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});


test("cancelling a real batch retains images and settings for retry", async ({ page }) => {
  await page.goto(`${MEDIA_URL}/png-to-jpg`);
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Add PNG images\b/ }).click();
  const chooser = await chooserEvent;
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#884422";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await chooser.setFiles([1, 2, 3].map((index) => ({ name: `large-${index}.png`, mimeType: "image/png", buffer: Buffer.from(bytes, "base64") })));
  await page.getByRole("spinbutton", { name: "Quality", exact: true }).fill("91");
  const convert = page.getByRole("button", { name: "Convert to JPG", exact: true });
  await convert.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Conversion cancelled.", { exact: false })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Quality", exact: true })).toHaveValue("91");
  await expect(page.getByRole("button", { name: /^Remove large-/ })).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Converted images", exact: true })).toHaveCount(0);
  await expect(convert).toBeEnabled();
});


test("output format dropdown keeps inputs, remembers settings and runs the selected encoder", async ({ page }) => {
  await page.goto(`${MEDIA_URL}/png-to-jpg`);
  const input = await fixture(page, "png", 1);
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Add PNG images\b/ }).click();
  await (await chooserEvent).setFiles(input);
  await page.getByRole("spinbutton", { name: "Quality", exact: true }).fill("91");
  const format = page.getByRole("combobox", { name: "Output format", exact: true });
  await format.click();
  await expect(page.getByRole("option", { name: "PNG", exact: true })).toBeDisabled();
  await page.getByRole("option", { name: "WebP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove source-1.png", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Background value", exact: true })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Quality", exact: true }).fill("75");
  await format.click();
  await page.getByRole("option", { name: "JPG (JPEG)", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Quality", exact: true })).toHaveValue("91");
  await format.click();
  await page.getByRole("option", { name: "WebP", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Quality", exact: true })).toHaveValue("75");
  await page.getByRole("button", { name: "Convert to WebP", exact: true }).click();
  const results = page.getByRole("region", { name: "Conversion results", exact: true });
  const output = await download(page, results.getByRole("button", { name: "Download source-1-converted.webp", exact: true }));
  expect(await inspectOutput(page, output.bytes, "webp")).toEqual({ width: 112, height: 72 });
  expect(page.url()).toContain("/png-to-jpg");
});
