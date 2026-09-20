/**
 * What a tool run returns.
 *
 * The union is discriminated on `render`, and the variants are closed on
 * purpose: there is no `details?: unknown` escape hatch, because the whole
 * point is that a renderer can exhaustively switch on `render` and never guess.
 * If a tool cannot express its output here, the union is wrong — extend it
 * deliberately rather than smuggling a payload through.
 */

import type { StoredToolArtifact } from "./artifacts";
import type { ToolArtifact, ToolFact, ToolValidationIssue } from "@/lib/tool-runtime/types";

export type { ToolArtifact, ToolFact, ToolValidationIssue };

export type ToolVerdict = {
  readonly level: "ok" | "warn" | "error";
  readonly label: string;
  readonly detail?: string;
};

export type ToolTextRender = {
  readonly render: "text";
  readonly text: string;
  readonly downloadName?: string;
};

export type ToolCodeRender = {
  readonly render: "code";
  readonly code: string;
  /** Highlighter hint, e.g. a language id. */
  readonly language: string;
  readonly downloadName?: string;
  /** The displayed code is a bounded preview of a complete generated artifact. */
  readonly truncated?: boolean;
};

export type ToolJsonTreeRender = {
  readonly render: "json-tree";
  /** Parsed JSON is genuinely of unrestricted shape; the renderer walks it. */
  readonly value: unknown;
  /** Pretty-printed form, when the tool already produced one. */
  readonly text?: string;
  readonly downloadName?: string;
};

export type ToolTableRender = {
  readonly render: "table";
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly showColumnDividers?: boolean;
  readonly truncated?: boolean;
  readonly downloadName?: string;
};

export type ToolKeyValueRender = {
  readonly render: "key-value";
  readonly entries: readonly ToolFact[];
};

export type ToolListRender = {
  readonly render: "list";
  /** Independent values, each individually copyable. */
  readonly items: readonly string[];
  /** Optional caption per item, shown as secondary text. */
  readonly labels?: readonly string[];
  readonly downloadName?: string;
  readonly truncated?: boolean;
};

export type ToolHtmlRender = {
  readonly render: "html";
  /** Tool-generated markup for preview. Renderers must sandbox it. */
  readonly html: string;
  readonly downloadName?: string;
};

export type ToolImageRender = {
  readonly render: "image";
  /** Data URL or object URL. */
  readonly src: string;
  readonly mime: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly downloadName?: string;
};

export type ToolDiffLine = {
  readonly kind: "added" | "removed" | "context";
  readonly text: string;
};

export type ToolDiffRender = {
  readonly render: "diff";
  readonly lines: readonly ToolDiffLine[];
  readonly leftLabel?: string;
  readonly rightLabel?: string;
};

export type ToolFilesRender = {
  readonly render: "files";
  readonly files: readonly StoredToolArtifact[];
  readonly inputBytes?: number;
  readonly outputBytes?: number;
};

export type ToolNoneRender = { readonly render: "none" };

export type ToolLinkPreviewImage = {
  readonly url: string;
  readonly previewUrl: string | null;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
};

export type ToolLinkPreviewRender = {
  readonly render: "link-preview";
  readonly requestedUrl: string;
  readonly resolvedUrl: string;
  readonly metadata: {
    readonly url: string;
    readonly title: string;
    readonly description: string;
    readonly siteName: string;
    readonly image: ToolLinkPreviewImage | null;
    readonly twitter: {
      readonly card: string;
      readonly title: string;
      readonly description: string;
      readonly image: ToolLinkPreviewImage | null;
    };
  };
  readonly tags: string;
  readonly checks: readonly {
    readonly level: "ok" | "warn" | "error";
    readonly property: string;
    readonly label: string;
    readonly detail: string;
  }[];
  readonly downloadName?: string;
};

export type ToolRender =
  | ToolTextRender
  | ToolCodeRender
  | ToolJsonTreeRender
  | ToolTableRender
  | ToolKeyValueRender
  | ToolListRender
  | ToolHtmlRender
  | ToolImageRender
  | ToolDiffRender
  | ToolFilesRender
  | ToolLinkPreviewRender
  | ToolNoneRender;

export type ToolRenderKind = ToolRender["render"];

/** A secondary block shown beside the primary render. */
export type ToolResultSection = {
  readonly title: string;
  readonly body: ToolRender;
};

export type ToolResultCommon = {
  /** Headline numbers: size, count, duration. */
  readonly stats?: readonly ToolFact[];
  /** Pass/fail summary for validator-style tools. */
  readonly verdict?: ToolVerdict;
  /** Non-fatal problems found while producing the result. */
  readonly issues?: readonly ToolValidationIssue[];
  /** Downloadable alternates of the same output. */
  readonly artifacts?: readonly ToolArtifact[];
  readonly sections?: readonly ToolResultSection[];
};

export type ToolResult = ToolRender & ToolResultCommon;
