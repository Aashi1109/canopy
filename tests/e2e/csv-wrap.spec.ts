import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

test.describe("Shared code editor wrap controls", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("keyboard toggles preserve text and regenerated output starts unwrapped", async ({ context, page }) => {
    await page.goto("/devtools/csv-to-tsv");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    const source = page.getByRole("region", { name: "CSV input", exact: true });
    const result = page.getByRole("region", { name: "Result", exact: true });
    const input = source.getByRole("textbox", { name: "CSV input", exact: true });
    const output = result.getByRole("textbox", { name: "Result code", exact: true });
    const inputWrap = source.getByRole("button", { name: "Wrap lines", exact: true });
    const outputWrap = result.getByRole("button", { name: "Wrap lines", exact: true });
    const convert = page.getByRole("button", { name: "Convert to TSV", exact: true });
    const note = "wide field ".repeat(16).trim();
    const csv = `name,note\nAda,"Hello, ${note}"\nLin,"first line\nsecond line"`;
    const tsv = `name\tnote\nAda\tHello, ${note}\nLin\t"first line\nsecond line"`;

    await expect(input).toBeEditable();
    await expect(inputWrap).toHaveAttribute("aria-pressed", "true");
    await input.fill(csv);
    await convert.click();
    await expect.poll(() => output.innerText()).toBe(tsv);
    await expect(outputWrap).toHaveAttribute("aria-pressed", "false");

    await inputWrap.focus();
    await inputWrap.press("Enter");
    await expect(inputWrap).toBeFocused();
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => input.innerText()).toBe(csv);
    await expect.poll(() => output.innerText()).toBe(tsv);

    await outputWrap.focus();
    await outputWrap.press("Space");
    await expect(outputWrap).toBeFocused();
    await expect(outputWrap).toHaveAttribute("aria-pressed", "true");
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => input.innerText()).toBe(csv);
    await expect.poll(() => output.innerText()).toBe(tsv);
    await result.getByRole("button", { name: "Copy all", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(tsv);

    const updatedCsv = `${csv}\nJo,Updated value`;
    const updatedTsv = `${tsv}\nJo\tUpdated value`;
    await input.fill(updatedCsv);
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await convert.click();
    await expect.poll(() => output.innerText()).toBe(updatedTsv);
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "false");
    await outputWrap.press("Space");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "true");
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => input.innerText()).toBe(updatedCsv);
    await expect.poll(() => output.innerText()).toBe(updatedTsv);
    await result.getByRole("button", { name: "Copy all", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(updatedTsv);
  });

  test("TSV input starts wrapped while converted CSV starts unwrapped", async ({ page }) => {
    await page.goto("/devtools/tsv-to-csv");
    const source = page.getByRole("region", { name: "TSV input", exact: true });
    const result = page.getByRole("region", { name: "Result", exact: true });
    const input = source.getByRole("textbox", { name: "TSV input", exact: true });
    const inputWrap = source.getByRole("button", { name: "Wrap lines", exact: true });
    await expect(input).toBeEditable();
    await expect(inputWrap).toHaveAttribute("aria-pressed", "true");
    await input.fill("name\tnote\nAda\tHello, world");
    await page.getByRole("button", { name: "Convert to CSV", exact: true }).click();
    await expect
      .poll(() => result.getByRole("textbox", { name: "Result code", exact: true }).innerText())
      .toBe('name,note\nAda,"Hello, world"');
    await expect(result.getByRole("button", { name: "Wrap lines", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(inputWrap).toHaveAttribute("aria-pressed", "true");
  });

  test("JSON and YAML start unwrapped and toggle independently without changing the data", async ({
    context,
    page,
  }) => {
    await page.goto("/devtools/json-to-yaml");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    const source = page.getByRole("region", { name: "JSON input", exact: true });
    const result = page.getByRole("region", { name: "Result", exact: true });
    const input = source.getByRole("textbox", { name: "JSON input", exact: true });
    const output = result.getByRole("textbox", { name: "Result code", exact: true });
    const inputWrap = source.getByRole("button", { name: "Wrap lines", exact: true });
    const outputWrap = result.getByRole("button", { name: "Wrap lines", exact: true });
    const json = '{\n  "name": "Ada",\n  "active": true\n}';
    const yaml = "name: Ada\nactive: true\n";
    await expect(input).toBeEditable();
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await input.fill(json);
    await page.getByRole("button", { name: "Convert to YAML", exact: true }).click();
    await expect(output).toContainText("active: true");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "false");
    const renderedOutput = await output.innerText();

    await inputWrap.press("Enter");
    await expect(inputWrap).toHaveAttribute("aria-pressed", "true");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => input.innerText()).toBe(json);
    await expect.poll(() => output.innerText()).toBe(renderedOutput);
    await outputWrap.press("Space");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "true");
    await expect(inputWrap).toHaveAttribute("aria-pressed", "true");
    await inputWrap.press("Enter");
    await expect(inputWrap).toHaveAttribute("aria-pressed", "false");
    await expect(outputWrap).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => input.innerText()).toBe(json);
    await expect.poll(() => output.innerText()).toBe(renderedOutput);
    await result.getByRole("button", { name: "Copy all", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(yaml);
  });

  test("a read-only large-file CSV source preview defaults to wrapped and can toggle", async ({ page }) => {
    await page.goto("/devtools/csv-to-tsv");
    const source = page.getByRole("region", { name: "CSV input", exact: true });
    const input = source.getByRole("textbox", { name: "CSV input", exact: true });
    const wrap = source.getByRole("button", { name: "Wrap lines", exact: true });
    await expect(input).toBeEditable();
    await source.locator('input[type="file"]').setInputFiles({
      name: "large-wrap.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`name,note\n${"Ada,preview\n".repeat(170_000)}`),
    });
    await expect(input).not.toBeEditable();
    await expect(wrap).toBeEnabled();
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await wrap.press("Enter");
    await expect(wrap).toHaveAttribute("aria-pressed", "false");
    await expect(input).not.toBeEditable();
  });
});
