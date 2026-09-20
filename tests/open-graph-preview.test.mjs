import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import https from "node:https";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import dns from "node:dns/promises";

import { fetchPublicResource, isPublicAddress, parsePublicUrl } from "../tools/open-graph-preview/fetchPage.ts";
import { parseMetadata } from "../tools/open-graph-preview/metadata.ts";
import { inspectPage } from "../tools/open-graph-preview/run.server.ts";

const publicAddress = { address: "93.184.216.34", family: 4 };
function response(body = "<html><head><title>Example</title></head></html>", overrides = {}) {
  return {
    status: 200,
    headers: new Headers({ "content-type": "text/html" }),
    body: Readable.from([Buffer.from(body)]),
    ...overrides,
  };
}
function transport(responses, addresses = [publicAddress]) {
  const calls = [];
  return {
    calls,
    resolve: async () => addresses,
    request: async (url, address) => {
      calls.push({ url: url.href, address });
      return responses.shift();
    },
  };
}

test("bare public domains default to HTTPS while explicit HTTP URLs retain their scheme", () => {
  for (const [input, expected] of [
    ["slack.com", "https://slack.com/"],
    ["www.slack.com/features", "https://www.slack.com/features"],
    ["slack.com/features?q=team#overview", "https://slack.com/features?q=team"],
    ["  slack.com/features?q=team#overview \n", "https://slack.com/features?q=team"],
    ["https://slack.com:443/features#overview", "https://slack.com/features"],
    ["http://slack.com:80/features?q=team#overview", "http://slack.com/features?q=team"],
  ]) {
    assert.equal(parsePublicUrl(input).href, expected, input);
  }
});

test("bare-domain normalization still rejects private targets, custom ports, credentials and unsafe schemes", () => {
  for (const input of [
    "localhost",
    "x.internal/path",
    "127.0.0.1",
    "127.1",
    "2130706433",
    "10.0.0.1/path",
    "169.254.169.254/latest/meta-data",
    "[::1]",
    "slack.com:8443/path",
    "user:pass@slack.com",
    "user@slack.com",
    "ftp://slack.com",
    "javascript:alert(1)",
    "mailto:user@slack.com",
    "data:text/html,<title>Example</title>",
  ]) {
    assert.throws(() => parsePublicUrl(input), { code: "invalid-url" }, input);
  }
});

test("public URL validation rejects local, reserved, credentialed, non-web and obfuscated targets", () => {
  for (const url of [
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "http://localhost",
    "https://x.local",
    "https://x.internal",
    "http://127.1",
    "http://0x7f000001",
    "http://2130706433",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254",
    "http://10.0.0.1",
    "https://example.com:8443",
  ]) {
    assert.throws(() => parsePublicUrl(url), { code: "invalid-url" }, url);
  }
  assert.equal(parsePublicUrl("https://example.com/path?q=1#part").href, "https://example.com/path?q=1");
  for (const address of [
    "0.0.0.0",
    "100.64.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "::",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "::ffff:8.8.8.8",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("every DNS answer must be public and requests receive the validated address", async () => {
  const blocked = transport([], [publicAddress, { address: "127.0.0.1", family: 4 }]);
  await assert.rejects(fetchPublicResource("https://example.com", "html", new AbortController().signal, blocked), {
    code: "private-address",
  });
  assert.equal(blocked.calls.length, 0);
  const safe = transport([response()]);
  const result = await fetchPublicResource("https://example.com", "html", new AbortController().signal, safe);
  assert.equal(result.url, "https://example.com/");
  assert.deepEqual(safe.calls[0].address, publicAddress);
});

test("Node transport pins the connection without replacing Host or TLS hostname", async (t) => {
  let lookupAddress;
  let hostname;
  const original = https.request;
  t.after(() => {
    https.request = original;
    syncBuiltinESMExports();
  });
  https.request = (url, options, done) => {
    hostname = url.hostname;
    options.lookup(url.hostname, { all: true }, (error, addresses) => {
      assert.equal(error, null);
      lookupAddress = addresses;
    });
    const request = new EventEmitter();
    request.end = () => {
      const body = Readable.from([Buffer.from("<title>Connected</title>")]);
      body.statusCode = 200;
      body.headers = { "content-type": "text/html" };
      done(body);
    };
    assert.equal(options.agent, false);
    assert.equal(options.headers.Cookie, undefined);
    return request;
  };
  syncBuiltinESMExports();
  const result = await fetchPublicResource("https://example.com", "html", new AbortController().signal, {
    resolve: async () => [publicAddress],
  });
  assert.equal(hostname, "example.com");
  assert.deepEqual(lookupAddress, [publicAddress]);
  assert.equal(result.bytes.toString(), "<title>Connected</title>");
});

test("DNS adapters accept Workers CNAME records alongside IP answers without bypassing private-IP checks", async (t) => {
  const original4 = dns.resolve4;
  const original6 = dns.resolve6;
  t.after(() => {
    dns.resolve4 = original4;
    dns.resolve6 = original6;
    syncBuiltinESMExports();
  });
  dns.resolve4 = async () => ["cdn.example.com.", publicAddress.address];
  dns.resolve6 = async () => ["cdn.example.com."];
  syncBuiltinESMExports();
  const network = transport([response()]);
  await fetchPublicResource("https://example.com", "html", new AbortController().signal, { request: network.request });
  assert.deepEqual(network.calls[0].address, publicAddress);
  dns.resolve4 = async () => ["cdn.example.com.", "127.0.0.1"];
  syncBuiltinESMExports();
  await assert.rejects(
    fetchPublicResource("https://example.com", "html", new AbortController().signal, { request: network.request }),
    { code: "private-address" },
  );
  assert.equal(network.calls.length, 1);
});

test("redirects are independently validated and bounded", async () => {
  const blocked = transport([
    response("", { status: 302, headers: new Headers({ location: "http://127.0.0.1/admin" }) }),
  ]);
  await assert.rejects(fetchPublicResource("https://example.com", "html", new AbortController().signal, blocked), {
    code: "invalid-url",
  });
  assert.equal(blocked.calls.length, 1);
  const safe = transport([response("", { status: 301, headers: new Headers({ location: "/new" }) }), response()]);
  assert.equal(
    (await fetchPublicResource("https://example.com", "html", new AbortController().signal, safe)).url,
    "https://example.com/new",
  );
  const loop = transport(
    Array.from({ length: 6 }, () => response("", { status: 302, headers: new Headers({ location: "/loop" }) })),
  );
  await assert.rejects(fetchPublicResource("https://example.com", "html", new AbortController().signal, loop), {
    code: "too-many-redirects",
  });
  let resolutions = 0;
  const rebind = transport([response("", { status: 302, headers: new Headers({ location: "/rebound" }) })]);
  rebind.resolve = async () => (++resolutions === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }]);
  await assert.rejects(fetchPublicResource("https://example.com", "html", new AbortController().signal, rebind), {
    code: "private-address",
  });
  assert.equal(rebind.calls.length, 1);
});

test("fetch rejects non-HTML, upstream errors and decompression bombs", async () => {
  for (const [value, code] of [
    [response("{}", { headers: new Headers({ "content-type": "application/json" }) }), "unsupported-content"],
    [response("denied", { status: 403 }), "upstream-rejected"],
    [
      response("large", { headers: new Headers({ "content-type": "text/html", "content-length": "99999999" }) }),
      "response-too-large",
    ],
    [
      response(gzipSync("a".repeat(2 * 1024 * 1024 + 1)), {
        headers: new Headers({ "content-type": "text/html", "content-encoding": "gzip" }),
      }),
      "response-too-large",
    ],
  ]) {
    await assert.rejects(
      fetchPublicResource("https://example.com", "html", new AbortController().signal, transport([value])),
      { code },
    );
  }
  const compressed = response(gzipSync("<title>Compressed</title>"), {
    headers: new Headers({ "content-type": "text/html", "content-encoding": "gzip" }),
  });
  assert.equal(
    (
      await fetchPublicResource("https://example.com", "html", new AbortController().signal, transport([compressed]))
    ).bytes.toString(),
    "<title>Compressed</title>",
  );
});

test("fetch honors already aborted and in-flight DNS cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchPublicResource("https://example.com", "html", controller.signal, transport([])), {
    name: "AbortError",
  });
  const waiting = new AbortController();
  const pending = fetchPublicResource("https://example.com", "html", waiting.signal, {
    resolve: () => new Promise(() => {}),
    request: () => assert.fail("no request expected"),
  });
  waiting.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("metadata parses entities and quoted attributes, applies OG/Twitter precedence and resolves relative URLs", () => {
  const result = parseMetadata(
    `<html><head><base href="/assets/"><title>Document &amp; title</title><meta name="description" content="Document description"><meta property="og:title" content="OG &amp; title"><meta property="og:description" content="x > y &quot;quoted&quot;"><meta property="og:image" content="cover.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="/canonical"><meta property="og:type" content="website"><meta name="twitter:title" content="X title"><meta name="twitter:card" content="summary_large_image"></head><body><script>document.write('<meta property="og:title" content="inert">')</script></body></html>`,
    "https://example.com/page",
  );
  assert.equal(result.metadata.title, "OG & title");
  assert.equal(result.metadata.description, 'x > y "quoted"');
  assert.equal(result.metadata.image.url, "https://example.com/assets/cover.png");
  assert.equal(result.metadata.image.width, 1200);
  assert.equal(result.metadata.image.previewUrl, null);
  assert.equal(result.metadata.url, "https://example.com/canonical");
  assert.equal(result.metadata.twitter.title, "X title");
  assert.match(result.tags, /content="OG &amp; title"/);
  assert.match(result.tags, /x &gt; y &quot;quoted&quot;/);
  assert.doesNotMatch(result.tags, /inert/);
});

test("missing, duplicate and unsafe tags produce truthful diagnostics and document fallbacks", () => {
  const fallback = parseMetadata(
    '<title>Fallback</title><meta name="description" content="Details"><meta property="og:image" content="javascript:alert(1)"><meta property="og:title" content=""><meta property="og:title" content="">',
    "https://example.com",
  );
  assert.equal(fallback.metadata.title, "Fallback");
  assert.equal(fallback.metadata.description, "Details");
  assert.equal(fallback.metadata.image, null);
  assert.ok(fallback.checks.some((check) => check.property === "og:title" && check.level === "warn"));
  assert.ok(fallback.checks.some((check) => check.property === "og:image" && check.level === "error"));
  assert.ok(fallback.checks.some((check) => check.label.includes("Duplicate")));
  assert.equal(parseMetadata("<body>No metadata</body>", "https://example.com/").metadata.title, "");
});

test("page inspection embeds validated raster images once and preserves real HTML tags", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4UAAAAASUVORK5CYII=",
    "base64",
  );
  const network = transport([
    response(
      '<title>Page</title><meta property="og:title" content="Preview"><meta property="og:image" content="/cover.png"><meta name="twitter:image" content="/cover.png">',
    ),
    response(png, { headers: new Headers({ "content-type": "image/png" }) }),
  ]);
  const result = await inspectPage("https://example.com/page", new AbortController().signal, network);
  assert.equal(result.render, "link-preview");
  assert.equal(result.metadata.title, "Preview");
  assert.equal(result.metadata.image.previewUrl, `data:image/png;base64,${png.toString("base64")}`);
  assert.equal(result.metadata.twitter.image.previewUrl, result.metadata.image.previewUrl);
  assert.equal(network.calls.length, 2);
  assert.match(result.tags, /content="\/cover.png"/);
  assert.doesNotMatch(result.tags, /<article|<!--/);
});

test("private, SVG and mislabeled images do not trigger unsafe browser requests or fail the page scan", async () => {
  for (const [image, imageResponse] of [
    ["http://127.0.0.1/secret.png", null],
    [
      "https://example.com/cover.svg",
      response("<svg></svg>", { headers: new Headers({ "content-type": "image/svg+xml" }) }),
    ],
    [
      "https://example.com/fake.png",
      response("<script>alert(1)</script>", { headers: new Headers({ "content-type": "image/png" }) }),
    ],
  ]) {
    const network = transport([
      response(`<title>Page</title><meta property="og:image" content="${image}">`),
      ...(imageResponse ? [imageResponse] : []),
    ]);
    const result = await inspectPage("https://example.com", new AbortController().signal, network);
    assert.equal(result.metadata.title, "Page");
    assert.equal(result.metadata.image.previewUrl, null);
    assert.ok(result.checks.some((check) => check.property === "image:fetch" && check.level === "warn"));
    assert.equal(network.calls.length, imageResponse ? 2 : 1);
  }
});

test("Cloudflare uses its public-only native fetch without cookies or automatic redirects", async (t) => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Cloudflare-Workers" }, configurable: true });
  t.after(() => Object.defineProperty(globalThis, "navigator", navigatorDescriptor));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: url.href, options });
    return new Response("<title>Decoded response</title>", {
      headers: { "content-type": "text/html", "content-encoding": "gzip" },
    });
  });
  const result = await fetchPublicResource("https://example.com", "html", new AbortController().signal, {
    resolve: async () => [publicAddress],
  });
  assert.match(result.bytes.toString(), /Decoded response/);
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});
