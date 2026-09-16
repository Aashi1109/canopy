import { createHash, timingSafeEqual } from "node:crypto";

type PublishCounts = { attempted: number; published: number; failed: number; remaining: number };

export type BlogCronEnv = {
  APP_URL?: string;
  BLOG_SCHEDULER_SECRET?: string;
  BLOG_PUBLISH_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

const PUBLISH_PATH = "/api/internal/blog/publish-due";
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;
const validSecret = (value: string | undefined): value is string =>
  Boolean(value && value.length <= 1024 && TOKEN_PATTERN.test(value));

function publishCounts(value: unknown): PublishCounts {
  if (!value || typeof value !== "object") throw new Error("Blog publishing returned an invalid response.");
  const result = value as Record<string, unknown>;
  for (const key of ["attempted", "published", "failed", "remaining"]) {
    if (!Number.isSafeInteger(result[key]) || (result[key] as number) < 0) {
      throw new Error("Blog publishing returned an invalid response.");
    }
  }
  return {
    attempted: result.attempted as number,
    published: result.published as number,
    failed: result.failed as number,
    remaining: result.remaining as number,
  };
}

export async function handleBlogPublishRequest(
  request: Request,
  secret: string | undefined,
  publish: () => Promise<PublishCounts>,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "POST" } });
  }
  if (!validSecret(secret)) {
    return Response.json({ error: "Blog publishing is not configured." }, { status: 503, headers });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.length <= 1031 ? /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(authorization)?.[1] : undefined;
  if (
    !token ||
    !timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(secret).digest())
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  try {
    return Response.json(publishCounts(await publish()), { headers });
  } catch {
    return Response.json({ error: "Blog publishing is temporarily unavailable." }, { status: 503, headers });
  }
}

export async function runBlogPublishCron(
  env: BlogCronEnv,
  fetchRemote: (request: Request) => Promise<Response> = fetch,
): Promise<PublishCounts> {
  if (!validSecret(env.BLOG_SCHEDULER_SECRET)) throw new Error("Invalid blog scheduler configuration.");
  let target: URL;
  try {
    target = env.BLOG_PUBLISH_URL
      ? new URL(env.BLOG_PUBLISH_URL)
      : new URL(PUBLISH_PATH, new URL(env.APP_URL ?? "https://smarttools.internal").origin);
  } catch {
    throw new Error("Invalid blog scheduler configuration.");
  }
  if (
    target.pathname !== PUBLISH_PATH ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    (env.BLOG_PUBLISH_URL && target.protocol !== "https:") ||
    (!env.BLOG_PUBLISH_URL && !env.WORKER_SELF_REFERENCE)
  ) {
    throw new Error("Invalid blog scheduler configuration.");
  }
  const request = new Request(target, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BLOG_SCHEDULER_SECRET}` },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  let response: Response;
  try {
    response = env.BLOG_PUBLISH_URL ? await fetchRemote(request) : await env.WORKER_SELF_REFERENCE!.fetch(request);
  } catch {
    throw new Error("Blog publishing request failed.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Blog publishing request returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Blog publishing returned an invalid response.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) throw new Error("Response too large.");
      chunks.push(chunk.value);
    }
    return publishCounts(JSON.parse(Buffer.concat(chunks, length).toString("utf8")));
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error("Blog publishing returned an invalid response.");
  } finally {
    reader.releaseLock();
  }
}
