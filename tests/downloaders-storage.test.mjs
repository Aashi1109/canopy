import { expect, test } from "vitest";
import {
  createStagingArtifacts,
  sealDownloadArtifacts,
  signStorageUrl,
  safeDownloadFilename,
} from "../lib/downloaders/storage.ts";
const env = {
  DOWNLOADERS_R2_ACCOUNT_ID: "a".repeat(32),
  DOWNLOADERS_R2_BUCKET: "test-downloads",
  DOWNLOADERS_R2_ACCESS_KEY_ID: "b".repeat(32),
  DOWNLOADERS_R2_SECRET_ACCESS_KEY: "c".repeat(64),
};
const token = {
  jobId: crypto.randomUUID(),
  attemptId: crypto.randomUUID(),
  generation: 1,
  slotId: "download-1",
  slotGeneration: 1,
};
const progress = () => ({ deadline: new Date(Date.now() + 60_000).toISOString(), heartbeat: async () => {} });
test("staging capabilities cover processing plus one-minute grace and retain private method-bound object access", async () => {
  const staged = await createStagingArtifacts(env, token);
  expect(staged.length).toBe(5);
  expect(new Set(staged.map((x) => x.storageKey)).size).toBe(5);
  for (const value of staged) {
    const put = new URL(value.putUrl),
      get = new URL(value.getUrl);
    expect(put.pathname).toBe(get.pathname);
    expect(put.searchParams.get("X-Amz-Expires")).toBe("660");
    expect(get.searchParams.get("X-Amz-Expires")).toBe("660");
    expect(put.searchParams.get("X-Amz-Signature")).not.toBe(get.searchParams.get("X-Amz-Signature"));
  }
  await expect(signStorageUrl(env, `sealed/${token.jobId}/file`, "PUT")).rejects.toThrow();
  await expect(signStorageUrl(env, "staging/x/../secret", "GET")).rejects.toThrow();
  await expect(signStorageUrl(env, "sealed/file", "GET", 301)).rejects.toThrow();
  await expect(signStorageUrl(env, "sealed/file", "GET", 660)).rejects.toThrow();
  await expect(signStorageUrl(env, "staging/file", "GET", 661)).rejects.toThrow();
  await expect(signStorageUrl(env, "staging/file", "PUT", 661)).rejects.toThrow();
  const sealed = new URL(await signStorageUrl(env, "sealed/file", "GET"));
  expect(sealed.searchParams.get("X-Amz-Expires")).toBe("300");
});
function artifact(stage) {
  return {
    id: stage.artifactId,
    storageKey: stage.storageKey,
    etag: '"abcdef0123456789abcdef0123456789"',
    name: "../../video\r\n.exe",
    mime: "video/mp4",
    bytes: 100,
    width: 1280,
    height: 720,
    durationSeconds: 10,
    hasAudio: true,
  };
}
test("promotion copies only the validated ETag to a new final key with safe attachment metadata", async () => {
  const staged = await createStagingArtifacts(env, token);
  const output = artifact(staged[0]);
  const calls = [];
  const result = await sealDownloadArtifacts(env, token, staged, [output], progress(), async (req) => {
    calls.push(req);
    return req.method === "PUT"
      ? new Response("<CopyObjectResult><ETag>abc</ETag></CopyObjectResult>")
      : new Response(null, { headers: { "Content-Length": "100", ETag: '"sealedetag"' } });
  });
  expect(calls[0].headers.get("x-amz-copy-source-if-match")).toBe(output.etag);
  expect(calls[0].headers.get("content-disposition")).toMatch(/^attachment; filename="[A-Za-z0-9 _-]+\.mp4"$/);
  expect(result[0].storageKey).toMatch(/^sealed\//);
  expect(result[0].storageKey).not.toBe(output.storageKey);
  expect(result[0].etag).toBe('"sealedetag"');
  expect(result[0].sizeBytes).toBe(100);
});
test("embedded CopyObject errors, wrong stored size, unknown keys and expired work never publish", async () => {
  const staged = await createStagingArtifacts(env, token);
  const output = artifact(staged[0]);
  await expect(
    sealDownloadArtifacts(
      env,
      token,
      staged,
      [output],
      progress(),
      async () => new Response("<Error><Code>Oops</Code></Error>"),
    ),
  ).rejects.toMatchObject({ code: "STORAGE_COPY_FAILED" });
  await expect(
    sealDownloadArtifacts(env, token, staged, [output], progress(), async (req) =>
      req.method === "PUT"
        ? new Response("<CopyObjectResult><ETag>abc</ETag></CopyObjectResult>")
        : new Response(null, { headers: { "Content-Length": "101", ETag: "wrong" } }),
    ),
  ).rejects.toThrow();
  await expect(
    sealDownloadArtifacts(env, token, staged, [{ ...output, storageKey: "staging/other" }], progress(), async () => {
      throw new Error("must not fetch");
    }),
  ).rejects.toMatchObject({ code: "INVALID_ARTIFACT" });
  await expect(
    sealDownloadArtifacts(
      env,
      token,
      staged,
      [output],
      { ...progress(), deadline: new Date(0).toISOString() },
      async () => {
        throw new Error("must not fetch");
      },
    ),
  ).rejects.toMatchObject({ code: "WORK_BUDGET" });
  expect(safeDownloadFilename("", "video/webm")).toBe("video.webm");
});
