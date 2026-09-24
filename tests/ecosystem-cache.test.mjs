import { expect, test, vi } from "vitest";
import { TOOL_CATEGORIES } from "../lib/tool-framework/categories.ts";

const state = vi.hoisted(() => ({ tools: [], failure: false }));
globalThis.__ecosystemCacheTest = state;

vi.mock("@sentry/core", () => ({ captureException: () => {} }));
vi.mock("@/lib/tool-framework/catalog", () => ({
  getPublicTools: async () => {
    if (state.failure) throw new Error("Database unavailable");
    return state.tools;
  },
}));

const { GET } = await import("@/app/api/tools/ecosystem/route.ts");

test("ecosystem groups use the public catalog, preserve previews and counts, and recover from failures", async () => {
  const tools = ["paperwork", "devtools", "media"].flatMap((app) =>
    Array.from({ length: 5 }, (_, index) => ({
      app,
      categoryKey: app === "paperwork" ? null : app === "devtools" ? "text-tools" : "image-editing",
      href: `/${app}/tool-${index}`,
      icon: { kind: "url", url: `https://example.test/${app}-${index}.png` },
      name: `${app} tool ${index}`,
      toolId: `${app}.tool-${index}`,
    })),
  );
  state.tools = tools;
  state.failure = false;
  const { groups } = await (await GET()).json();
  expect(groups.map(({ id }) => id)).toEqual(["documents", "developer", "media"]);
  for (const [index, app] of ["paperwork", "devtools", "media"].entries()) {
    const matching = tools.filter((tool) => tool.app === app);
    expect(groups[index].count).toBe(5);
    expect(groups[index].href).toBe(`/${app}`);
    expect(groups[index].tools).toEqual(
      matching.slice(0, app === "paperwork" ? 5 : 4).map(({ href, icon, name, toolId }) => ({
        href,
        icon,
        name,
        toolId,
      })),
    );
    expect(groups[index].categories).toEqual(
      Object.entries(TOOL_CATEGORIES)
        .filter(([, category]) => category.app === app)
        .map(([key, category]) => ({
          count: matching.filter((tool) => tool.categoryKey === key).length,
          href: `/${app}?category=${encodeURIComponent(key)}`,
          label: category.label,
        })),
    );
  }

  state.tools = [];
  expect(
    (await (await GET()).json()).groups.every((group) => group.count === 0 && group.tools.length === 0),
  ).toBeTruthy();
  state.failure = true;
  const failed = await GET();
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: "Database unavailable" });
  state.failure = false;
  state.tools = tools;
  expect(await (await GET()).json()).toEqual({ groups });
});
