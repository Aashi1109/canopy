/** Browser-safe downloader API contracts. No server or engine imports here. */
import { z } from "zod";
/** Platform IDs are validated against the service registry at server boundaries. */
export type PlatformId = string;
export type DownloadQuality = "720" | "1080";
export const MAX_DOWNLOAD_DURATION_SECONDS = 30 * 60;
export const MAX_DOWNLOAD_WORK_MS = 10 * 60_000;
export type DownloadOwner = Readonly<{ kind: "guest" | "account"; id: string }>;
export type DownloadState =
  "queued" | "running" | "ready" | "cancelling" | "succeeded" | "failed" | "cancelled" | "expired";
export type DownloadFailure = Readonly<{ code: string; message: string; retryable: boolean }>;
export type DownloadArtifact = Readonly<{
  id: string;
  name: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  hasAudio: boolean;
}>;
export const downloadFormatIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,80}(?:\+[A-Za-z0-9._-]{1,80})?$/);
export const downloadFormatSchema = z
  .object({
    id: downloadFormatIdSchema,
    container: z.enum(["mp4", "webm"]),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    fps: z.number().positive().max(240).nullable(),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    estimatedBytes: z.boolean(),
    hasAudio: z.boolean(),
    requiresMerge: z.boolean(),
    videoCodec: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  })
  .strict()
  .refine((format) => format.requiresMerge === format.id.includes("+") && (!format.requiresMerge || format.hasAudio));
export const downloadInspectionSchema = z
  .object({
    title: z.string().min(1).max(300),
    durationSeconds: z.number().positive().max(MAX_DOWNLOAD_DURATION_SECONDS).nullable(),
    formats: z
      .array(downloadFormatSchema)
      .min(1)
      .max(80)
      .refine((formats) => new Set(formats.map((format) => format.id)).size === formats.length),
  })
  .strict();
export type DownloadInspection = z.infer<typeof downloadInspectionSchema>;
export type DownloadFormat = DownloadInspection["formats"][number];
export type DownloadJob = Readonly<{
  id: string;
  requestId: string;
  platform: PlatformId;
  state: DownloadState;
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  error: DownloadFailure | null;
  artifacts: readonly DownloadArtifact[];
  inspect?: boolean;
  inspection?: DownloadInspection | null;
  selectedFormat?: string | null;
}>;
export type CreateDownload = Readonly<{
  platform: PlatformId;
  url: string;
  quality: DownloadQuality;
  requestId: string;
  inspect?: boolean;
  selectedFormat?: string;
  expectedFormat?: DownloadFormat;
}>;
export type OwnerDownloadLimits = Readonly<{ daily: number; active: number; queued: number }>;
export type DownloadPolicy = Readonly<{
  version: number;
  guest: OwnerDownloadLimits;
  account: OwnerDownloadLimits;
  updatedAt: string;
}>;

export class DownloadError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, status = 400, retryable = false) {
    super(message);
    this.name = "DownloadError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
