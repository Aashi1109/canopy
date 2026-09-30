import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { createHash } from "node:crypto";
import { AuthServiceError, getSession } from "../auth/session";
import { isSameOriginRequest } from "../routing/requestOrigin";
import { DownloadError, downloadFormatIdSchema, type DownloadOwner } from "./contracts";
import {
  createGuestCookie,
  privateIdentityHash,
  readDownloadJson,
  readGuestOwner,
  downloadErrorResponse,
  signCapability,
} from "./security";
import { getDownloadPolicy, saveDownloadPolicy } from "./policy";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const emptyBody = z.object({}).strict();
const createBody = z
  .object({
    platform: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    url: z.string().min(1).max(4096),
    quality: z.enum(["720", "1080"]),
    requestId: z.uuid(),
    inspect: z.boolean().optional(),
  })
  .strict();
const selectBody = z.object({ formatId: downloadFormatIdSchema }).strict();
type Binding = { fetch(request: Request): Promise<Response> };
type AppDownloaderEnv = {
  DOWNLOADERS?: Binding;
  DOWNLOADERS_GUEST_SECRET?: string;
  DOWNLOADERS_GUEST_PREVIOUS_SECRET?: string;
  DOWNLOADERS_NETWORK_SECRET?: string;
};

/** The local runner provides a loopback-only transport for Next's Node dev server. */
function localDownloaderBinding(): Binding | undefined {
  if (process.env.NODE_ENV !== "development" || process.env.DOWNLOADERS_LOCAL !== "true") return;
  const secret = process.env.DOWNLOADERS_CONTROL_SECRET ?? "";
  let origin: URL;
  try {
    origin = new URL(process.env.DOWNLOADERS_LOCAL_ORIGIN ?? "");
  } catch {
    return;
  }
  if (
    secret.length < 32 ||
    origin.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    return;
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const body = await request.text();
      const token = signCapability(
        {
          purpose: "download-local-control-v1",
          path,
          bodyHash: createHash("sha256").update(body).digest("hex"),
          expiresAt: Math.floor(Date.now() / 1000) + 60,
        },
        secret,
      );
      return fetch(
        new Request(new URL(path, origin), {
          method: "POST",
          body,
          redirect: "manual",
          signal: request.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        }),
      );
    },
  };
}

async function authenticatedOwners(
  request: Request,
  env: AppDownloaderEnv,
): Promise<{ owners: DownloadOwner[]; account: DownloadOwner | null }> {
  // Authentication errors must never become an anonymous quota bypass.
  const session = await getSession(request.headers, { includeAdmin: false });
  if (session?.user.status !== undefined && session.user.status !== "active")
    throw new DownloadError("ACCOUNT_SUSPENDED", "This account cannot request downloads.", 403);
  const account: DownloadOwner | null = session ? { kind: "account", id: session.user.id } : null;
  const guest = readGuestOwner(request.headers, [
    env.DOWNLOADERS_GUEST_SECRET ?? "",
    env.DOWNLOADERS_GUEST_PREVIOUS_SECRET ?? "",
  ]);
  return { account, owners: [account, guest].filter((owner): owner is DownloadOwner => owner !== null) };
}
async function appEnvironment(): Promise<{ env: AppDownloaderEnv; cloudflare: boolean }> {
  const local = {
    env: {
      DOWNLOADERS: localDownloaderBinding(),
      DOWNLOADERS_GUEST_SECRET: process.env.DOWNLOADERS_GUEST_SECRET,
      DOWNLOADERS_GUEST_PREVIOUS_SECRET: process.env.DOWNLOADERS_GUEST_PREVIOUS_SECRET,
      DOWNLOADERS_NETWORK_SECRET: process.env.DOWNLOADERS_NETWORK_SECRET,
    },
    cloudflare: false,
  };
  // OpenNext can create a Wrangler context in development without our local bindings.
  if (process.env.NODE_ENV === "development" && process.env.DOWNLOADERS_LOCAL === "true") return local;
  try {
    const context = await getCloudflareContext({ async: true });
    return { env: context.env as AppDownloaderEnv, cloudflare: Boolean(context.cf) };
  } catch {
    // Local Next development can exercise identity/admin without a public execution URL.
    return local;
  }
}
export async function handleDownloadRequest(
  request: Request,
  action: "guest" | "create" | "select" | "submission" | "status" | "cancel" | "artifact" | "policy",
  ids: { jobId?: string; artifactId?: string; requestId?: string } = {},
): Promise<Response> {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  let requestId: string | undefined;
  let jobId: string | undefined;
  const measure = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      timings[stage] = Math.round(performance.now() - start);
    }
  };
  try {
    const mutation = request.method !== "GET";
    if (mutation && !isSameOriginRequest(request))
      throw new DownloadError("INVALID_ORIGIN", "Reload this page before trying again.", 403);
    for (const id of Object.values(ids)) z.uuid().parse(id);
    requestId = ids.requestId;
    jobId = ids.jobId;
    const body = mutation ? await readDownloadJson(request) : undefined;
    const { env, cloudflare } = await measure("environment", appEnvironment);
    const { owners, account } = await measure("identity", () => authenticatedOwners(request, env));
    if (action === "policy") {
      if (!account) throw new DownloadError("UNAUTHORIZED", "Sign in to manage downloader limits.", 401);
      const policy =
        request.method === "GET" ? await getDownloadPolicy(account.id) : await saveDownloadPolicy(account.id, body);
      return Response.json({ policy }, { headers: PRIVATE_HEADERS });
    }
    if (action === "guest") {
      emptyBody.parse(body);
      let cookie: string | undefined;
      let owner = owners[0];
      if (!owner) {
        cookie = createGuestCookie(env.DOWNLOADERS_GUEST_SECRET ?? "");
        owner = readGuestOwner(new Headers({ cookie: cookie.split(";")[0] }), [env.DOWNLOADERS_GUEST_SECRET ?? ""])!;
      }
      const id = privateIdentityHash(`scope:${owner.kind}:${owner.id}`, env.DOWNLOADERS_GUEST_SECRET ?? "");
      return Response.json(
        { owner: { kind: owner.kind, id } },
        { headers: { ...PRIVATE_HEADERS, ...(cookie ? { "Set-Cookie": cookie } : {}) } },
      );
    }
    if (!owners.length)
      throw new DownloadError("IDENTITY_REQUIRED", "Reload this page to establish your download session.", 401);
    if (!env.DOWNLOADERS)
      throw new DownloadError("DOWNLOADS_NOT_CONFIGURED", "The download service is not configured.", 503);
    const input = action === "create" ? createBody.parse(body) : undefined;
    requestId = input?.requestId ?? requestId;
    const selection = action === "select" ? selectBody.parse(body) : undefined;
    if (action === "cancel") emptyBody.parse(body);
    const networkHash =
      action === "create"
        ? privateIdentityHash(
            `network:${cloudflare ? (request.headers.get("cf-connecting-ip") ?? "unknown") : "local"}`,
            env.DOWNLOADERS_NETWORK_SECRET ?? "",
          )
        : undefined;
    const binding = env.DOWNLOADERS;
    const upstream = await measure("worker", () =>
      binding.fetch(
        new Request(`https://downloaders.internal/${action}`, {
          method: "POST",
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owners: action === "create" ? [owners[0]] : owners,
            input,
            networkHash,
            ...selection,
            ...ids,
          }),
          signal: AbortSignal.timeout(15_000),
        }),
      ),
    );
    const headers = new Headers(PRIVATE_HEADERS);
    for (const key of ["content-type", "location", "retry-after"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    if (process.env.NODE_ENV === "development")
      headers.set(
        "Server-Timing",
        Object.entries(timings)
          .map(([stage, duration]) => `${stage};dur=${duration}`)
          .join(", "),
      );
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof AuthServiceError)
      return downloadErrorResponse(
        new DownloadError("AUTH_UNAVAILABLE", "Sign-in verification is temporarily unavailable.", 503, true),
      );
    return downloadErrorResponse(error);
  } finally {
    console.info(
      JSON.stringify({
        event: "downloader_timing",
        stage: "api",
        action,
        requestId,
        jobId,
        durationMs: Math.round(performance.now() - startedAt),
        timings,
      }),
    );
  }
}
