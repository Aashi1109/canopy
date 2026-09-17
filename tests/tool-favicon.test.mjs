import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import nextTesting from "next/experimental/testing/server.js";

const iconsUrl = new URL("../lib/tool-framework/icons.ts", import.meta.url).href;
const proxyUrl = new URL("../proxy.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === proxyUrl && specifier === "@canopy/auth") {
      return { shortCircuit: true, url: "data:text/javascript,export const auth = {}" };
    }
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/tool-framework/icons") {
      return nextResolve(iconsUrl, context);
    }
    if (context.parentURL === iconsUrl && specifier === "./identicon") {
      return nextResolve(new URL("../lib/tool-framework/identicon.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { resolveIcon, toolFaviconHref } = await import(iconsUrl);
const { GET } = await import("../app/tool-icons/[...path]/route.ts");
const { config } = await import(proxyUrl);
hooks.deregister();

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKo8AAAAASUVORK5CYII=",
  "base64",
);
const cloudEnv = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const row = {
  toolId: "media.resize-image",
  publicId: "smarttools/tool-icons/media.resize-image",
  version: "123",
  format: "svg",
  width: 104,
  height: 88,
  updatedAt: new Date("2026-09-17T00:00:00Z"),
};
const validPath = ["v123", "smarttools", "tool-icons", "media.resize-image.png"];
const request = (pathname = "/tool-icons/" + validPath.join("/")) =>
  new Request("https://app.example" + pathname, {
    headers: { Cookie: "session=private-session", Authorization: "Bearer private-token" },
  });
const call = (path = validPath) => GET(request(), { params: Promise.resolve({ path }) });

test.beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "favicon-test";
});
test.after(() => {
  if (cloudEnv === undefined) delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  else process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = cloudEnv;
});

test("uploaded tool favicons round-trip through a versioned same-origin PNG URL", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    requests.push({ input, options });
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  });
  const href = toolFaviconHref(resolveIcon(row.toolId, "Resize image", row));
  assert.equal(href, "/tool-icons/v123/smarttools/tool-icons/media.resize-image.png");
  assert.equal(
    toolFaviconHref(resolveIcon(row.toolId, "Resize image", { ...row, version: "124" })),
    "/tool-icons/v124/smarttools/tool-icons/media.resize-image.png",
    "replaced icons receive a different browser cache key",
  );
  const url = new URL(href, "https://app.example");
  const path = url.pathname.slice("/tool-icons/".length).split("/").map(decodeURIComponent);
  const response = await GET(request(href), { params: Promise.resolve({ path }) });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Cache-Control"), /public/);
  assert.match(response.headers.get("Cache-Control"), /max-age=[1-9]\d*/);
  assert.equal(response.headers.get("Location"), null);
  assert.equal(requests.length, 1);
  const [{ input, options }] = requests;
  assert.equal(
    String(input),
    "https://res.cloudinary.com/favicon-test/image/upload/f_png,c_fill,w_256,h_256,q_auto/v123/smarttools/tool-icons/media.resize-image.png",
  );
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal, "upstream request has a timeout signal");
  const headers = new Headers(options.headers);
  assert.equal(headers.get("Cookie"), null);
  assert.equal(headers.get("Authorization"), null);

  const escaped = toolFaviconHref(
    resolveIcon(row.toolId, "Resize image", { ...row, publicId: "smarttools/tool-icons/resize image + café" }),
  );
  assert.equal(escaped, "/tool-icons/v123/smarttools/tool-icons/resize%20image%20%2B%20caf%C3%A9.png");
  const escapedPath = escaped.slice("/tool-icons/".length).split("/").map(decodeURIComponent);
  const escapedResponse = await GET(request(escaped), { params: Promise.resolve({ path: escapedPath }) });
  assert.equal(escapedResponse.status, 200);
  assert.deepEqual(Buffer.from(await escapedResponse.arrayBuffer()), png);
  assert.equal(
    String(requests[1].input),
    "https://res.cloudinary.com/favicon-test/image/upload/f_png,c_fill,w_256,h_256,q_auto/v123/smarttools/tool-icons/resize%20image%20%2B%20caf%C3%A9.png",
  );
});

test("generated fallback SVG remains a correctly escaped data URI", () => {
  for (const configured of [true, false]) {
    if (!configured) delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const icon = resolveIcon("tool-fallback", "<script &test", configured ? null : row);
    assert.equal(icon.kind, "svg");
    const href = toolFaviconHref(icon);
    assert.match(href, /^data:image\/svg\+xml,/);
    assert.equal(decodeURIComponent(href.split(",").slice(1).join(",")), icon.svg);
    assert.match(icon.svg, /&lt;&amp;/);
    assert.doesNotMatch(href, /[<>\s#]/);
  }
});

test("invalid favicon paths never issue an upstream request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Invalid path reached the network");
  });
  for (const path of [
    undefined,
    "v123/icon.png",
    [],
    ["v123"],
    ["123", "icon.png"],
    ["v0", "icon.png"],
    ["v-1", "icon.png"],
    ["v1.5", "icon.png"],
    ["v123", "..", "icon.png"],
    ["v123", ".", "icon.png"],
    ["v123", "", "icon.png"],
    ["v123", "%2e%2e", "icon.png"],
    ["v123", "https://example.com", "icon.png"],
    ["v123", "safe/../private.png"],
    ["v123", "safe\\private.png"],
    ["v123", "icon.png?url=https://example.com"],
    ["v123", "icon.png#fragment"],
    ["v123", "icon.svg"],
    ["v123", "icon.jpg"],
    ["v123", ".png"],
    ["v123", "\u0000icon.png"],
    ["v123", "a".repeat(1025) + ".png"],
    ["v123", ...Array(16).fill("folder"), "icon.png"],
  ]) {
    const response = await GET(request(), { params: Promise.resolve({ path }) });
    assert.equal(response.status, 404, String(JSON.stringify(path)));
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("public favicon files bypass session lookups without bypassing page or API protection", () => {
  const { unstable_doesMiddlewareMatch: doesProxyMatch } = nextTesting;
  for (const url of [
    "/tool-icons/v123/smarttools/tool-icons/media.resize-image.png",
    "/tool-icons/v124/Canopy/platform/assets/default/icons/extract-pdf-pages.png",
  ]) {
    assert.equal(doesProxyMatch({ config, url }), false, url);
  }
  for (const url of ["/media/extract-pdf-pages", "/devtools/json-editor", "/api/tools/search", "/tool-icons-other"]) {
    assert.equal(doesProxyMatch({ config, url }), true, url);
  }
});

test("missing delivery configuration fails without requesting another Cloudinary account", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unconfigured route reached the network");
  });
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const response = await call();
  assert.equal(response.status, 503);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("upstream redirects, non-PNG responses, failures and timeouts never become cached favicons", async (t) => {
  const responses = [
    () => new Response("unavailable", { status: 404 }),
    () => new Response("unavailable", { status: 500 }),
    () => new Response(null, { status: 302, headers: { Location: "https://example.com/icon.png" } }),
    () => new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } }),
    () => {
      throw new Error("private-upstream-detail");
    },
    () => {
      throw new DOMException("private-upstream-detail", "TimeoutError");
    },
  ];
  let current;
  t.mock.method(globalThis, "fetch", async () => current());
  for (current of responses) {
    const response = await call();
    assert.equal(response.status, 502);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    assert.notEqual(response.headers.get("Content-Type"), "image/png");
    assert.equal(response.headers.get("Location"), null);
    assert.doesNotMatch(await response.text(), /private-upstream-detail/);
  }
});
