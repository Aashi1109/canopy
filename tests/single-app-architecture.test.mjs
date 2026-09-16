import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function exists(path) {
  try {
    await access(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test("the repository root is the only Next.js application", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.equal(packageJson.name, "smarttools");
  assert.equal(typeof packageJson.dependencies.next, "string");
  assert.equal(await exists("apps"), false);
  assert.equal(await exists("src"), false);
  assert.equal(await exists("app/layout.tsx"), true);
});

test("each product area owns a real pathname segment", async () => {
  const routes = [
    "app/page.tsx",
    "app/admin/(protected)/layout.tsx",
    "app/admin/(protected)/tools/page.tsx",
    "app/admin/denied/page.tsx",
    "app/auth/page.tsx",
    "app/auth/profile/page.tsx",
    "app/devtools/[slug]/page.tsx",
    "app/media/[slug]/page.tsx",
    "app/paperwork/[slug]/page.tsx",
  ];

  for (const route of routes) {
    assert.equal(await exists(route), true, `${route} must exist`);
  }
});

test("domain APIs are namespaced in the unified application", async () => {
  const routes = [
    "app/api/auth/[...all]/route.ts",
    "app/api/admin/templates/[id]/export/route.ts",
    "app/api/paperwork/storage/route.ts",
    "app/api/paperwork/storage/[key]/route.ts",
    "app/api/paperwork/templates/route.ts",
    "app/api/paperwork/vendors/route.ts",
  ];

  for (const route of routes) {
    assert.equal(await exists(route), true, `${route} must exist`);
  }
});

test("media isolation headers cover pages and their worker bundles", async () => {
  const source = await readFile(new URL("next.config.ts", root), "utf8");

  assert.match(source, /source:\s*["']\/media\/:path\*["']/);
  assert.match(source, /source:\s*["']\/_next\/static\/chunks\/:path\*["']/);
  assert.doesNotMatch(source, /source:\s*["']\/\(\.\*\)["']/);
});
