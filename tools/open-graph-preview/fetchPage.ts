import { resolve4, resolve6 } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { ToolError } from "../../lib/tool-framework/run.ts";
import { parseWebsiteUrl } from "./url.ts";

type Address = { address: string; family: 4 | 6 };
type ResourceResponse = { status: number; headers: Headers; body: Readable };
type Transport = {
  resolve: (hostname: string) => Promise<readonly Address[]>;
  request: (url: URL, address: Address, signal: AbortSignal) => Promise<ResourceResponse>;
};

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  // Only global unicast is eligible. This also rejects IPv4-mapped, NAT64,
  // unique-local, loopback, link-local and multicast addresses.
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function parsePublicUrl(value: string): URL {
  const url = parseWebsiteUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(hostname) && !isPublicAddress(hostname)) {
    throw new ToolError("invalid-url", "Enter a public website URL or domain.");
  }
  return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

const transport: Transport = {
  async resolve(hostname) {
    const addresses = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
    return addresses.flatMap((result, index) =>
      result.status === "fulfilled"
        ? result.value
            // Workers' DNS shim includes CNAME strings in address answers.
            // Keep actual address records; all of them still pass the public-IP gate.
            .filter((address) => isIP(address) === (index === 0 ? 4 : 6))
            .map((address) => ({ address, family: index === 0 ? (4 as const) : (6 as const) }))
        : [],
    );
  },
  async request(url, address, signal) {
    const headers = {
      "User-Agent": "SmartTools-OpenGraph/1.0",
      Accept: "text/html,application/xhtml+xml,image/*",
      "Accept-Encoding": "gzip, deflate, br",
    };
    if (globalThis.navigator?.userAgent === "Cloudflare-Workers") {
      // Workers' native global fetch filters resolved IPs at connection time
      // using workerd's public-only network capability. Its node:http shim
      // ignores lookup, so use native fetch with manually validated redirects.
      // global_fetch_strictly_public also prevents same-zone origin bypasses.
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
      });
      const responseHeaders = new Headers(response.headers);
      // fetch exposes decoded bytes; decoding again would corrupt the stream.
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      return {
        status: response.status,
        headers: responseHeaders,
        body: response.body
          ? Readable.fromWeb(response.body as import("node:stream/web").ReadableStream)
          : Readable.from([]),
      };
    }
    return new Promise((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          signal,
          agent: false,
          maxHeaderSize: 32768,
          headers,
          // Keep the original hostname for Host, TLS SNI and certificate checks;
          // connect only to the address we have already validated.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        },
        (response) => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
          resolve({ status: response.statusCode ?? 0, headers, body: response });
        },
      );
      request.once("error", reject);
      request.end();
    });
  },
};

async function readBody(response: ResourceResponse, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) {
    response.body.destroy();
    throw new ToolError("response-too-large", "The remote response is too large to preview.");
  }
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  const decoder =
    encoding === "gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : encoding === "br"
          ? createBrotliDecompress()
          : null;
  if (encoding && encoding !== "identity" && !decoder) {
    response.body.destroy();
    throw new ToolError("unsupported-content", "The page uses an unsupported content encoding.");
  }
  let transferred = 0;
  const source = Readable.from(
    (async function* () {
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        transferred += chunk.length;
        if (transferred > limit)
          throw new ToolError("response-too-large", "The remote response is too large to preview.");
        yield chunk;
      }
    })(),
  );
  const stream = decoder ? source.pipe(decoder) : source;
  if (decoder) source.once("error", (error) => decoder.destroy(error));
  const abort = () => {
    response.body.destroy(signal.reason);
    stream.destroy(signal.reason);
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > limit) throw new ToolError("response-too-large", "The remote response is too large to preview.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    stream.destroy();
    source.destroy();
    response.body.destroy();
  }
}

export async function fetchPublicResource(
  value: string,
  kind: "html" | "image",
  signal: AbortSignal,
  network: Partial<Transport> = transport,
): Promise<{ url: string; bytes: Buffer; contentType: string }> {
  let url = parsePublicUrl(value);
  const timeout = AbortSignal.timeout(15000);
  const operationSignal = AbortSignal.any([signal, timeout]);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      operationSignal.throwIfAborted();
      const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
      const family = isIP(hostname);
      const addresses = family
        ? [{ address: hostname, family: family as 4 | 6 }]
        : await abortable((network.resolve ?? transport.resolve)(hostname), operationSignal);
      if (!addresses.length) throw new ToolError("unreachable-url", "The website's address could not be resolved.");
      if (addresses.some(({ address }) => !isPublicAddress(address)))
        throw new ToolError("private-address", "Only public websites can be inspected.");
      const response = await abortable(
        (network.request ?? transport.request)(url, addresses[0], operationSignal),
        operationSignal,
      );
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        response.body.destroy();
        if (redirects === 5) throw new ToolError("too-many-redirects", "The website redirects too many times.");
        const location = response.headers.get("location");
        if (!location) throw new ToolError("upstream-rejected", "The website returned an invalid redirect.");
        url = parsePublicUrl(new URL(location, url).href);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.body.destroy();
        throw new ToolError(
          "upstream-rejected",
          `The website returned HTTP ${response.status}. It may block automated previews.`,
          "Try another public page or retry later.",
        );
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      const allowed =
        kind === "html"
          ? ["text/html", "application/xhtml+xml"]
          : ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
      if (!allowed.includes(contentType)) {
        response.body.destroy();
        throw new ToolError(
          "unsupported-content",
          kind === "html"
            ? "This URL does not return an HTML page."
            : "The preview image is not a supported raster image.",
        );
      }
      const bytes = await readBody(response, kind === "html" ? 2 * 1024 * 1024 : 5 * 1024 * 1024, operationSignal);
      return { url: url.href, bytes, contentType };
    }
    throw new ToolError("too-many-redirects", "The website redirects too many times.");
  } catch (error) {
    signal.throwIfAborted();
    if (timeout.aborted) throw new ToolError("request-timeout", "The website took too long to respond. Try again.");
    if (error instanceof ToolError) throw error;
    throw new ToolError("unreachable-url", "The website could not be reached securely. Check its URL and try again.");
  }
}
