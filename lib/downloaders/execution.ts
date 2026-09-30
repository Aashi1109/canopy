import { z } from "zod";
import type { EngineRequest } from "./PlatformService";
import { downloadInspectionSchema, MAX_DOWNLOAD_DURATION_SECONDS } from "./contracts";

export type AttemptIdentity = {
  jobId: string;
  attemptGeneration: number;
  slotGeneration: number;
  startOrdinal: 1 | 2 | 3 | 4;
};
export type ContainerStart = AttemptIdentity & {
  protocolVersion: 1;
  deadline: string;
  limits: {
    workMs: number;
    sourceBytes: number;
    outputBytes: number;
    fileBytes: number;
    scratchBytes: number;
    durationSeconds: number;
    maxItems: number;
  };
  request: EngineRequest;
  stagingArtifacts: { artifactId: string; storageKey: string; putUrl: string; getUrl: string }[];
};
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const item = z.object({ id: z.string().max(256), type: z.enum(["video", "image"]) }).strict();
export const containerStatusSchema = z
  .object({
    state: z.enum(["running", "succeeded", "failed", "cancelled"]),
    stopped: z.boolean(),
    phase: z.string().max(80),
    usage: z.object({ sourceBytes: integer, workMs: integer }).strict(),
    artifacts: z
      .array(
        z
          .object({
            id: z.uuid(),
            storageKey: z.string().max(256),
            etag: z.string().min(1).max(128),
            name: z.string().min(1).max(180),
            mime: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
            bytes: integer.positive(),
            width: integer.positive(),
            height: integer.positive(),
            durationSeconds: z.number().positive().max(MAX_DOWNLOAD_DURATION_SECONDS),
            hasAudio: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    evidence: z
      .object({
        originalComposition: z.enum(["complete", "unknown"]),
        sourceId: z.string().max(256),
        resolvedSourceUrl: z.string().max(4096).optional(),
        items: z.array(item).max(6),
        isLive: z.boolean().optional(),
        requiresAuthentication: z.boolean().optional(),
      })
      .strict()
      .nullable(),
    inspection: downloadInspectionSchema.nullable().optional(),
    error: z
      .object({ code: z.string().max(80), message: z.string().max(1000), retryable: z.boolean() })
      .strict()
      .nullable(),
  })
  .strict();
export type ContainerStatus = z.infer<typeof containerStatusSchema>;
