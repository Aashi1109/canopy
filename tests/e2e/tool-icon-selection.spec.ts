import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_PASSWORD } from "./fixtures/accounts";
import { AuthPage } from "./pages/AuthPage";

test("icon selection supports replacement, failed-upload retry, and reset", async ({ page, baseURL }) => {
  await new AuthPage(page).signIn(E2E_ACCOUNTS.admin.email, E2E_PASSWORD, `${baseURL}/admin/tools`);
  await page
    .getByRole("link", { name: /^Edit / })
    .first()
    .click();
  await page.getByRole("link", { name: "Icon & activation" }).click();
  test.skip(
    await page.getByText("Icon uploads are disabled", { exact: true }).isVisible(),
    "Requires configured icon uploads.",
  );

  const input = page.getByLabel("Choose an icon", { exact: true });
  const dropzone = page.getByText("Choose a replacement icon", { exact: true });
  const upload = page.getByRole("button", { name: "Upload", exact: true });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );

  await expect(dropzone).toBeVisible();
  await expect(upload).toHaveCount(0);
  await input.setInputFiles({ name: "first.png", mimeType: "image/png", buffer: png });
  await expect(dropzone).toHaveCount(0);
  await expect(page.getByAltText("Selected icon preview")).toBeVisible();
  await expect(upload).toBeEnabled();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose another", exact: true }).click();
  const chooser = await chooserPromise;
  // Oversized input is rejected before any remote upload or database mutation.
  await chooser.setFiles({
    name: "too-large.png",
    mimeType: "image/png",
    buffer: Buffer.concat([png, Buffer.alloc(1_048_577)]),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await upload.click();
    await expect(page.getByText("The icon must be 1 MB or smaller.", { exact: true })).toBeVisible();
    await expect(upload).toBeEnabled();
    await expect(page.getByText("too-large.png", { exact: true })).toBeVisible();
    await expect(dropzone).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dropzone).toBeVisible();
  await expect(upload).toHaveCount(0);
  await expect(page.getByAltText("Selected icon preview")).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect(page.getByText("The icon must be 1 MB or smaller.", { exact: true })).toHaveCount(0);
});
