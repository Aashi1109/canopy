import { z } from "zod";
import {
  downloadFormatIdSchema,
  downloadFormatSchema,
  type DownloadFormat,
  type DownloadQuality,
  type PlatformId,
} from "./contracts.ts";

export type EngineId = "yt-dlp" | "cobalt";
export type ContentForm = "video" | "short" | "reel" | "post" | "clip" | "spotlight";

export interface PlatformDescriptor {
  readonly platformId: PlatformId;
  readonly definitionKey: `${PlatformId}-video-downloader`;
  readonly toolId: `media.${PlatformId}-video-downloader`;
  readonly name: string;
  readonly description: string;
  readonly hosts: readonly string[];
  /** Provider/CDN hosts the engines may contact; wildcards match subdomains only. */
  readonly egressHosts: readonly string[];
  readonly contentForms: readonly ContentForm[];
  readonly candidateEngines: readonly EngineId[];
  readonly ytDlpExtractors: readonly string[];
  readonly singleVideoForms: readonly ContentForm[];
}

export interface PlatformSource {
  readonly platformId: PlatformId;
  readonly id: string;
  readonly url: string;
  readonly contentForm: ContentForm;
}

type UnsupportedCode =
  | "invalid_url"
  | "unsupported_url"
  | "unsupported_platform"
  | "invalid_evidence"
  | "incomplete_evidence"
  | "source_mismatch"
  | "unsupported_media"
  | "too_many_items"
  | "restricted_content"
  | "live_content";

export interface UnsupportedSource {
  readonly status: "unsupported";
  readonly code: UnsupportedCode;
  readonly message: string;
}

export type SourceParseResult =
  | { readonly status: "supported"; readonly source: PlatformSource }
  | { readonly status: "short-link"; readonly url: string }
  | UnsupportedSource;

export type EngineRequest =
  | {
      readonly engine: "yt-dlp";
      readonly url: string;
      readonly quality: DownloadQuality;
      readonly noPlaylist: true;
      readonly sourceId: string;
      readonly extractorKeys: readonly string[];
      readonly sourceComposition: "single-video" | "verified-post";
      readonly inspect?: boolean;
      readonly selectedFormat?: string;
      readonly expectedFormat?: DownloadFormat;
    }
  | {
      readonly engine: "cobalt";
      readonly platformId: PlatformId;
      readonly url: string;
      readonly sourceId: string;
      readonly quality: DownloadQuality;
      readonly sourceComposition: "single-video";
      readonly inspect?: boolean;
      readonly selectedFormat?: string;
      readonly expectedFormat?: DownloadFormat;
    };

export type SourceClassification =
  | { readonly status: "supported"; readonly items: readonly { readonly id: string; readonly type: "video" }[] }
  | UnsupportedSource;

const evidenceId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const evidenceSchema = z
  .object({
    originalComposition: z.enum(["complete", "unknown"]),
    sourceId: evidenceId,
    resolvedSourceUrl: z.string().max(4096).optional(),
    items: z
      .array(z.object({ id: evidenceId, type: z.enum(["video", "image"]) }).strict())
      .min(1)
      .max(5),
    isLive: z.boolean().optional(),
    requiresAuthentication: z.boolean().optional(),
  })
  .strict();
const optionsSchema = z
  .object({
    quality: z.enum(["720", "1080"]),
    inspect: z.boolean().optional(),
    selectedFormat: downloadFormatIdSchema.optional(),
    expectedFormat: downloadFormatSchema.optional(),
  })
  .strict()
  .refine((options) => options.selectedFormat === options.expectedFormat?.id);
const forbiddenParameter =
  /^(?:list|playlist|password|passwd|pass|access_token|auth|authorization|token|session|sessionid|cookie)$/i;

export function definePlatformDescriptor(
  descriptor: Omit<PlatformDescriptor, "definitionKey" | "toolId">,
): PlatformDescriptor {
  return Object.freeze({
    ...descriptor,
    definitionKey: `${descriptor.platformId}-video-downloader` as const,
    toolId: `media.${descriptor.platformId}-video-downloader` as const,
    hosts: Object.freeze([...descriptor.hosts]),
    egressHosts: Object.freeze([...new Set([...descriptor.hosts, ...descriptor.egressHosts])]),
    contentForms: Object.freeze([...descriptor.contentForms]),
    candidateEngines: Object.freeze([...descriptor.candidateEngines]),
    ytDlpExtractors: Object.freeze([...descriptor.ytDlpExtractors]),
    singleVideoForms: Object.freeze([...descriptor.singleVideoForms]),
  });
}

/** Pure platform policy; execution, redirects, quotas and artifacts belong to the shared runner. */
export abstract class PlatformService {
  abstract readonly descriptor: PlatformDescriptor;
  readonly inspectionEngine: "yt-dlp" | "youtubei" | "instagram" = "yt-dlp";
  /** The native extractor verifies the original post before filtering its media. */
  readonly verifiesPostComposition: boolean = false;
  abstract parseUrl(url: URL): SourceParseResult;

  enginesFor(source: PlatformSource, selectedFormat?: string): readonly EngineId[] {
    if (!this.isCanonicalSource(source)) return [];
    const singleVideo = this.descriptor.singleVideoForms.includes(source.contentForm);
    if (!singleVideo && !this.verifiesPostComposition) return [];
    // Cobalt representation IDs are private to its resolver; never pass them to yt-dlp.
    return this.descriptor.candidateEngines.filter(
      (engine) =>
        (engine !== "cobalt" || singleVideo) && (!selectedFormat?.startsWith("cobalt.") || engine === "cobalt"),
    );
  }

  protected unsupported(
    code: UnsupportedCode = "unsupported_url",
    message = "This link is not a supported public video or video post.",
  ): UnsupportedSource {
    return { status: "unsupported", code, message };
  }

  protected validateUrl(url: URL): UnsupportedSource | undefined {
    if (
      !(url instanceof URL) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      url.href.length > 4096 ||
      !this.descriptor.hosts.includes(url.hostname) ||
      /%(?:00|2f|5c|2e)/i.test(url.pathname)
    )
      return this.unsupported(
        "invalid_url",
        "Use a supported HTTPS video link without credentials, ports or fragments.",
      );

    const keys = new Set<string>();
    for (const key of url.searchParams.keys()) {
      if (keys.has(key) || forbiddenParameter.test(key)) return this.unsupported();
      keys.add(key);
    }
  }

  protected supported(url: URL, id: string, contentForm: ContentForm): SourceParseResult {
    return {
      status: "supported",
      source: Object.freeze({ platformId: this.descriptor.platformId, id, url: url.href, contentForm }),
    };
  }

  protected shortLink(url: URL): SourceParseResult {
    const normalized = new URL(url.href);
    normalized.search = "";
    return { status: "short-link", url: normalized.href };
  }

  private isCanonicalSource(source: PlatformSource): boolean {
    if (
      !source ||
      typeof source !== "object" ||
      source.platformId !== this.descriptor.platformId ||
      typeof source.url !== "string"
    )
      return false;
    try {
      const parsed = this.parseUrl(new URL(source.url));
      return (
        parsed.status === "supported" &&
        parsed.source.id === source.id &&
        parsed.source.contentForm === source.contentForm &&
        parsed.source.url === source.url
      );
    } catch {
      return false;
    }
  }

  buildEngineRequest(
    source: PlatformSource,
    engine: EngineId,
    options: {
      readonly quality: DownloadQuality;
      readonly inspect?: boolean;
      readonly selectedFormat?: string;
      readonly expectedFormat?: DownloadFormat;
    },
  ): EngineRequest {
    const validated = optionsSchema.safeParse(options);
    if (!validated.success || !this.enginesFor(source, validated.data.selectedFormat).includes(engine)) {
      throw new TypeError("Unsupported platform source, engine or output options.");
    }
    const common = { url: source.url, sourceId: source.id, ...validated.data };
    if (engine === "yt-dlp")
      return {
        ...common,
        engine,
        noPlaylist: true,
        extractorKeys: this.descriptor.ytDlpExtractors,
        sourceComposition: this.descriptor.singleVideoForms.includes(source.contentForm)
          ? "single-video"
          : "verified-post",
      };
    return {
      ...common,
      engine,
      platformId: source.platformId,
      sourceComposition: "single-video",
    };
  }

  classifySource(source: PlatformSource, evidence: unknown): SourceClassification {
    if (!this.isCanonicalSource(source))
      return this.unsupported("source_mismatch", "The source could not be verified.");
    // Check count before schema traversal so an oversized engine array is not copied or walked.
    if (
      evidence &&
      typeof evidence === "object" &&
      "items" in evidence &&
      Array.isArray(evidence.items) &&
      evidence.items.length > 5
    ) {
      return this.unsupported("too_many_items", "This post exceeds the five-video limit.");
    }
    const validated = evidenceSchema.safeParse(evidence);
    if (!validated.success)
      return this.unsupported("invalid_evidence", "The source returned incomplete or invalid media information.");
    const value = validated.data;
    let resolvedMatches = false;
    if (value.resolvedSourceUrl) {
      try {
        const resolved = this.parseUrl(new URL(value.resolvedSourceUrl));
        resolvedMatches = resolved.status === "supported" && resolved.source.id === source.id;
      } catch {
        /* Untrusted engine metadata is not an identity proof. */
      }
      if (!resolvedMatches)
        return this.unsupported("source_mismatch", "The returned media does not match the requested source.");
    }
    if (value.sourceId !== source.id && !resolvedMatches)
      return this.unsupported("source_mismatch", "The returned media does not match the requested source.");
    if (value.isLive) return this.unsupported("live_content", "Live recording is not supported.");
    if (value.requiresAuthentication)
      return this.unsupported("restricted_content", "Only accessible public videos are supported.");
    if (value.originalComposition !== "complete")
      return this.unsupported("incomplete_evidence", "The complete source composition could not be verified.");
    if (value.items.some((item) => item.type !== "video"))
      return this.unsupported("unsupported_media", "Photo and mixed-media posts are not supported.");
    if (source.contentForm !== "post" && value.items.length !== 1)
      return this.unsupported("unsupported_media", "This link must identify one video.");
    if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
      return this.unsupported("invalid_evidence", "The source returned ambiguous media identities.");
    return { status: "supported", items: value.items.map((item) => ({ id: item.id, type: "video" })) };
  }
}
