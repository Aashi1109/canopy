import { AwsClient } from "aws4fetch";
import { DownloadError, MAX_DOWNLOAD_WORK_MS } from "./contracts";
import type { ContainerStart, ContainerStatus } from "./execution";
import type { DownloadAttemptToken, SealedDownloadArtifact } from "./jobs";
import { promoteLocalArtifact, signLocalStorageUrl, type LocalStorageEnv } from "./localStorage";

const STAGING_URL_TTL_SECONDS = Math.ceil(MAX_DOWNLOAD_WORK_MS / 1000) + 60;

export type DownloadStorageEnv = LocalStorageEnv & {
  DOWNLOADERS_R2_ACCOUNT_ID?: string;
  DOWNLOADERS_R2_BUCKET?: string;
  DOWNLOADERS_R2_ACCESS_KEY_ID?: string;
  DOWNLOADERS_R2_SECRET_ACCESS_KEY?: string;
};
function connection(env: DownloadStorageEnv) {
  if (
    !/^[a-f0-9]{32}$/.test(env.DOWNLOADERS_R2_ACCOUNT_ID ?? "") ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.DOWNLOADERS_R2_BUCKET ?? "") ||
    !env.DOWNLOADERS_R2_ACCESS_KEY_ID ||
    !env.DOWNLOADERS_R2_SECRET_ACCESS_KEY
  )
    throw new DownloadError("STORAGE_UNAVAILABLE", "Download storage is unavailable.", 503, true);
  return {
    base: `https://${env.DOWNLOADERS_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.DOWNLOADERS_R2_BUCKET}`,
    client: new AwsClient({
      service: "s3",
      region: "auto",
      accessKeyId: env.DOWNLOADERS_R2_ACCESS_KEY_ID,
      secretAccessKey: env.DOWNLOADERS_R2_SECRET_ACCESS_KEY,
      retries: 0,
    }),
  };
}
function objectUrl(base: string, key: string) {
  if (!/^(?:staging|sealed)\/[a-zA-Z0-9_/-]+$/.test(key) || key.length > 256)
    throw new DownloadError("INVALID_ARTIFACT", "The stored download is invalid.", 503);
  return `${base}/${key}`;
}
export async function signStorageUrl(
  env: DownloadStorageEnv,
  key: string,
  method: "GET" | "PUT",
  expiresIn = 300,
): Promise<string> {
  if (
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > (key.startsWith("staging/") ? STAGING_URL_TTL_SECONDS : 300) ||
    (method === "PUT" && !key.startsWith("staging/"))
  )
    throw new DownloadError("INVALID_ARTIFACT", "The stored download is invalid.", 503);
  if (env.DOWNLOADERS_LOCAL === "true") return signLocalStorageUrl(env, key, method, expiresIn);
  const { base, client } = connection(env);
  return (await client.sign(`${objectUrl(base, key)}?X-Amz-Expires=${expiresIn}`, { method, aws: { signQuery: true } }))
    .url;
}
export async function createStagingArtifacts(
  env: DownloadStorageEnv,
  token: DownloadAttemptToken,
): Promise<ContainerStart["stagingArtifacts"]> {
  return Promise.all(
    Array.from({ length: 5 }, async () => {
      const artifactId = crypto.randomUUID();
      const storageKey = `staging/${token.jobId}/${token.generation}/${crypto.randomUUID()}/${artifactId}`;
      const [putUrl, getUrl] = await Promise.all([
        signStorageUrl(env, storageKey, "PUT", STAGING_URL_TTL_SECONDS),
        signStorageUrl(env, storageKey, "GET", STAGING_URL_TTL_SECONDS),
      ]);
      return { artifactId, storageKey, putUrl, getUrl };
    }),
  );
}
export function safeDownloadFilename(name: string, mime: string): string {
  const extension = mime === "video/webm" ? ".webm" : mime === "video/quicktime" ? ".mov" : ".mp4";
  const stem =
    name
      .replace(/\.[^.]*$/, "")
      .replace(/[^A-Za-z0-9 _-]/g, "_")
      .trim()
      .slice(0, 100) || "video";
  return `${stem}${extension}`;
}
/** Publish only the version read back and validated by the supervisor; local R2 streams the copy. */
export async function sealDownloadArtifacts(
  env: DownloadStorageEnv,
  token: DownloadAttemptToken,
  staged: ContainerStart["stagingArtifacts"],
  artifacts: ContainerStatus["artifacts"],
  progress: { deadline: string; heartbeat: () => Promise<void> },
  fetchStorage: typeof fetch = fetch,
): Promise<SealedDownloadArtifact[]> {
  const remote = env.DOWNLOADERS_LOCAL === "true" ? null : connection(env);
  if (
    !artifacts.length ||
    artifacts.length > 5 ||
    new Set(artifacts.map((a) => a.id)).size !== artifacts.length ||
    artifacts.reduce((n, a) => n + a.bytes, 0) > 500 * 1024 ** 2
  )
    throw new DownloadError("INVALID_ARTIFACT", "The output could not be verified.", 422);
  const timeout = (maximum: number) => {
    const remaining = Date.parse(progress.deadline) - Date.now();
    if (remaining <= 0) throw new DownloadError("WORK_BUDGET", "The download reached its processing limit.", 422);
    return AbortSignal.timeout(Math.max(1, Math.min(maximum, remaining)));
  };
  const sealed: SealedDownloadArtifact[] = [];
  for (const artifact of artifacts) {
    if (
      !staged.some((value) => value.artifactId === artifact.id && value.storageKey === artifact.storageKey) ||
      artifact.bytes > 250 * 1024 ** 2 ||
      !/^"?[a-fA-F0-9-]{16,100}"?$/.test(artifact.etag)
    )
      throw new DownloadError("INVALID_ARTIFACT", "The output could not be verified.", 422);
    const filename = safeDownloadFilename(artifact.name, artifact.mime);
    const storageKey = `sealed/${token.jobId}/${token.generation}/${crypto.randomUUID()}/${artifact.id}`;
    let sealedEtag: string;
    if (!remote) {
      sealedEtag = await promoteLocalArtifact(env, artifact, { storageKey, filename, mime: artifact.mime }, progress);
    } else {
      const headers = {
        "x-amz-copy-source": `/${env.DOWNLOADERS_R2_BUCKET}/${artifact.storageKey}`,
        "x-amz-copy-source-if-match": artifact.etag,
        "x-amz-metadata-directive": "REPLACE",
        "Content-Type": artifact.mime,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      };
      await progress.heartbeat();
      const copy = await fetchStorage(
        await remote.client.sign(objectUrl(remote.base, storageKey), { method: "PUT", headers }),
        {
          redirect: "error",
          signal: timeout(10_000),
        },
      );
      // CopyObject may report an error inside an HTTP 200. Read its small bounded XML response.
      const xml = await boundedStorageText(copy);
      if (!copy.ok || !/<CopyObjectResult(?:\s|>)/.test(xml) || /<Error(?:\s|>)/.test(xml))
        throw new DownloadError("STORAGE_COPY_FAILED", "The download could not be saved. Try again.", 503, true);
      await progress.heartbeat();
      const head = await fetchStorage(
        await remote.client.sign(objectUrl(remote.base, storageKey), { method: "HEAD" }),
        {
          redirect: "error",
          signal: timeout(10_000),
        },
      );
      if (!head.ok || Number(head.headers.get("content-length")) !== artifact.bytes || !head.headers.get("etag"))
        throw new DownloadError("STORAGE_VERIFY_FAILED", "The saved download could not be verified.", 503, true);
      sealedEtag = head.headers.get("etag")!;
    }
    sealed.push({
      id: artifact.id,
      storageKey,
      filename,
      mimeType: artifact.mime,
      sizeBytes: artifact.bytes,
      etag: sealedEtag,
      metadata: {
        width: artifact.width,
        height: artifact.height,
        durationSeconds: artifact.durationSeconds,
        hasAudio: artifact.hasAudio,
      },
    });
  }
  return sealed;
}
async function boundedStorageText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let text = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return text + decoder.decode();
      bytes += next.value.byteLength;
      if (bytes > 16_384) {
        await reader.cancel();
        throw new DownloadError("STORAGE_VERIFY_FAILED", "The storage response was invalid.", 503);
      }
      text += decoder.decode(next.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
