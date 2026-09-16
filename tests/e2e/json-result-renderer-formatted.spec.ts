import { expect, test } from "@playwright/test";

test("JSON Viewer Tree metadata and find work across result views", async ({ page }) => {
  await page.goto("http://localhost:3000/devtools/json-viewer");

  const renderer = page.getByTestId("json-result-renderer");
  const input = page.getByRole("textbox", { name: "JSON input" });
  const source = JSON.stringify({
    name: "CodeUtilityKit",
    version: 2,
    active: true,
    tags: ["json", "viewer", "free"],
    author: { name: "Dev", url: "https://codeutilitykit.com" },
  });
  await expect(input).toBeEditable();
  await page.getByRole("button", { name: "Example", exact: true }).click();
  await expect(input).toHaveValue(/CodeUtilityKit/);
  await input.fill(source);
  await expect(input).toHaveValue(source);
  const tree = renderer.getByRole("tree", { name: "JSON tree" });

  for (const type of ["OBJECT", "ARRAY", "STRING", "NUMBER", "BOOLEAN"]) {
    await expect(tree.getByText(type, { exact: true }).first()).toBeVisible();
  }
  for (const summary of ["{5 keys}", "[3 items]", "{2 keys}"]) {
    await expect(tree.getByText(summary, { exact: true })).toBeVisible();
  }
  const search = renderer.getByRole("searchbox", {
    name: "Search JSON result",
  });
  const previous = renderer.getByRole("button", {
    name: "Previous JSON search match",
  });
  const next = renderer.getByRole("button", {
    name: "Next JSON search match",
  });

  await expect(renderer.getByRole("searchbox")).toHaveCount(1);
  await expect(renderer.getByText("0/0", { exact: true })).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  await expect(next).toHaveCount(0);
  await search.fill("name");
  await expect(renderer.getByText("1/2", { exact: true })).toBeVisible();
  await expect(renderer.locator("[data-json-search-current=true]")).toHaveCount(1);

  await next.click();
  await expect(renderer.getByText("2/2", { exact: true })).toBeVisible();
  await previous.click();
  await expect(renderer.getByText("1/2", { exact: true })).toBeVisible();

  await renderer.getByRole("tab", { name: "Formatted" }).click();
  await expect(search).toHaveValue("name");
  await expect(renderer.getByRole("searchbox")).toHaveCount(1);
  await expect(renderer.getByText("1/2", { exact: true })).toBeVisible();
  await expect(renderer.locator("[data-formatted-match=true]")).toHaveCount(2);

  const previousBox = await previous.boundingBox();
  const nextBox = await next.boundingBox();
  expect(previousBox).not.toBeNull();
  expect(nextBox).not.toBeNull();
  expect(nextBox!.x - (previousBox!.x + previousBox!.width)).toBe(0);

  await search.fill("missing");
  await expect(renderer.getByText("0/0", { exact: true })).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();

  await search.fill("name");
  await next.click();
  await expect(renderer.getByText("2/2", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 500, height: 900 });
  const responsiveSearch = renderer.getByRole("searchbox", {
    name: "Search JSON result",
  });
  await expect(responsiveSearch).toHaveValue("name");
  await expect(renderer.getByText("2/2", { exact: true })).toBeVisible();
  const responsiveNext = renderer.getByRole("button", {
    name: "Next JSON search match",
  });
  const searchControlBox = await renderer.getByTestId("json-search-control").boundingBox();
  const responsiveNextBox = await responsiveNext.boundingBox();
  expect(searchControlBox).not.toBeNull();
  expect(responsiveNextBox).not.toBeNull();
  expect(
    Math.round(searchControlBox!.x + searchControlBox!.width - responsiveNextBox!.x - responsiveNextBox!.width),
  ).toBe(10);

  await renderer.getByRole("tab", { name: "Tree" }).click();
  await renderer.getByRole("button", { name: "Add root property" }).click();
  await expect(input).toHaveValue(/"newProperty": null/);
});
