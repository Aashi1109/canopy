import { createHash, timingSafeEqual } from "node:crypto";
import { errorMessage } from "../../utils/errorMessage.ts";

type MaintenanceCounts = { files: number; runs: number; failed: number };

export type AssistantCronEnv = {
  APP_URL?: string;
  ASSISTANT_SCHEDULER_SECRET?: string;
  ASSISTANT_MAINTENANCE_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

const MAINTENANCE_PATH = "/api/internal/assistant/maintenance";
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;
const validSecret = (value: string | undefined): value is string =>
  Boolean(value && value.length <= 1024 && TOKEN_PATTERN.test(value));

function maintenanceCounts(value: unknown): MaintenanceCounts {
  if (!value || typeof value !== "object") throw new Error("Assistant maintenance returned an invalid response.");
  const result = value as Record<string, unknown>;
  for (const key of ["files", "runs", "failed"]) {
    if (!Number.isSafeInteger(result[key]) || (result[key] as number) < 0) {
      throw new Error("Assistant maintenance returned an invalid response.");
    }
  }
  return {
    files: result.files as number,
    runs: result.runs as number,
    failed: result.failed as number,
  };
}

export async function handleAssistantMaintenanceRequest(
  request: Request,
  secret: string | undefined,
  cleanup: () => Promise<MaintenanceCounts>,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "POST" } });
  }
  if (!validSecret(secret)) {
    return Response.json({ error: "Assistant maintenance is not configured." }, { status: 503, headers });
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
    return Response.json(maintenanceCounts(await cleanup()), { headers });
  } catch (error) {
    return Response.json(
      { error: errorMessage(error, "Assistant maintenance is temporarily unavailable.") },
      { status: 503, headers },
    );
  }
}

export async function runAssistantMaintenanceCron(
  env: AssistantCronEnv,
  fetchRemote: (request: Request) => Promise<Response> = fetch,
): Promise<MaintenanceCounts> {
  if (!validSecret(env.ASSISTANT_SCHEDULER_SECRET)) throw new Error("Invalid assistant scheduler configuration.");
  let target: URL;
  try {
    target = env.ASSISTANT_MAINTENANCE_URL
      ? new URL(env.ASSISTANT_MAINTENANCE_URL)
      : new URL(MAINTENANCE_PATH, new URL(env.APP_URL ?? "https://smarttools.internal").origin);
  } catch {
    throw new Error("Invalid assistant scheduler configuration.");
  }
  if (
    target.pathname !== MAINTENANCE_PATH ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    (env.ASSISTANT_MAINTENANCE_URL && target.protocol !== "https:") ||
    (!env.ASSISTANT_MAINTENANCE_URL && !env.WORKER_SELF_REFERENCE)
  ) {
    throw new Error("Invalid assistant scheduler configuration.");
  }
  const request = new Request(target, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ASSISTANT_SCHEDULER_SECRET}` },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  let response: Response;
  try {
    response = env.ASSISTANT_MAINTENANCE_URL
      ? await fetchRemote(request)
      : await env.WORKER_SELF_REFERENCE!.fetch(request);
  } catch {
    throw new Error("Assistant maintenance request failed.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Assistant maintenance request returned HTTP ${response.status}.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Assistant maintenance returned an invalid response.");
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
    return maintenanceCounts(JSON.parse(Buffer.concat(chunks, length).toString("utf8")));
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error("Assistant maintenance returned an invalid response.");
  } finally {
    reader.releaseLock();
  }
}
