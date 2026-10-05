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
import type { ToolArtifact, ToolFact, ToolValidationIssue, ToolMessage } from "@/lib/tool-runtime/types";

export type { ToolArtifact, ToolFact, ToolValidationIssue };

export type ToolVerdict = {
  readonly level: "ok" | "warn" | "error";
  readonly label: string;
  readonly labelMessage?: ToolMessage;
  readonly detail?: string;
  readonly detailMessage?: ToolMessage;
};

export type ToolTextRender = {
  readonly render: "text";
  readonly text: string;
  /** Optional syntax hint for lightweight highlighting of the displayed text. */
  readonly language?: string;
  /** The displayed text is a bounded preview of a complete generated artifact. */
  readonly truncated?: boolean;
  /** Alternate structured view; copy and download retain the original text. */
  readonly tablePreview?: ToolTableRender;
  /** Read-only structured view; exports retain the original text. */
  readonly jsonPreview?: ToolJsonTreeRender;
  /** Aligned comparison view; exports retain the original marked text. */
  readonly diffPreview?: ToolDiffRender;
  readonly downloadName?: string;
};

export type ToolCodeRender = {
  readonly render: "code";
  readonly code: string;
  /** Highlighter hint, e.g. a language id. */
  readonly language: string;
  /** Alternate structured view; copy and download retain the original code. */
  readonly tablePreview?: ToolTableRender;
  /** Read-only structured view; exports retain the original code. */
  readonly jsonPreview?: ToolJsonTreeRender;
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
  /** Only a bounded portion of the complete result is represented. */
  readonly truncated?: boolean;
  readonly downloadName?: string;
};

export type ToolTableRender = {
  readonly render: "table";
  readonly columns: readonly string[];
  readonly columnMessages?: readonly (ToolMessage | undefined)[];
  readonly rows: readonly (readonly string[])[];
  readonly rowMessages?: readonly (readonly (ToolMessage | undefined)[])[];
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
  readonly itemMessages?: readonly (ToolMessage | undefined)[];
  /** Optional caption per item, shown as secondary text. */
  readonly labels?: readonly string[];
  readonly downloadName?: string;
  readonly truncated?: boolean;
};

export type ToolHtmlRender = {
  readonly render: "html";
  /** Tool-generated markup for preview. Renderers must sandbox it. */
  readonly html: string;
  /** Structured table preview; copy and download still use the generated HTML. */
  readonly tablePreview?: ToolTableRender;
  /** Complete plain-code markup whose syntax coloring is deferred by its workspace. */
  readonly deferCodeHighlighting?: boolean;
  readonly downloadName?: string;
};

export type ToolImageRender = {
  readonly render: "image";
  /** Data URL or object URL. */
  readonly src: string;
  readonly mime: string;
  readonly alt: string;
  readonly altMessage?: ToolMessage;
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
  readonly leftLabelMessage?: ToolMessage;
  readonly rightLabel?: string;
  readonly rightLabelMessage?: ToolMessage;
  readonly downloadName?: string;
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
    readonly labelMessage?: ToolMessage;
    readonly detail: string;
    readonly detailMessage?: ToolMessage;
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
  readonly titleMessage?: ToolMessage;
  readonly body: ToolRender;
};

export type ToolResultCommon = {
  /** Transient completion feedback, shown once through the shared toast. */
  readonly notification?: ToolVerdict;
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

/** Localize presentation metadata only; generated text, data and artifact bytes remain unchanged. */
export function translateToolResult(
  result: ToolResult,
  translate: (message: ToolMessage, fallback: string) => string,
): ToolResult {
  const presentation = (value: ToolRender): ToolRender => {
    if (value.render === "image" && value.altMessage) return { ...value, alt: translate(value.altMessage, value.alt) };
    if (value.render === "diff")
      return {
        ...value,
        leftLabel: value.leftLabelMessage ? translate(value.leftLabelMessage, value.leftLabel ?? "") : value.leftLabel,
        rightLabel: value.rightLabelMessage
          ? translate(value.rightLabelMessage, value.rightLabel ?? "")
          : value.rightLabel,
      };
    if (value.render === "text" && value.diffPreview)
      return { ...value, diffPreview: presentation(value.diffPreview) as ToolDiffRender };
    return value;
  };
  const verdict = (value: ToolVerdict | undefined): ToolVerdict | undefined =>
    value && {
      ...value,
      label: value.labelMessage ? translate(value.labelMessage, value.label) : value.label,
      detail: value.detailMessage ? translate(value.detailMessage, value.detail ?? "") : value.detail,
    };
  return {
    ...result,
    ...presentation(result),
    verdict: verdict(result.verdict),
    notification: verdict(result.notification),
    issues: result.issues?.map((issue) => ({
      ...issue,
      message: issue.messageRef ? translate(issue.messageRef, issue.message) : issue.message,
    })),
    sections: result.sections?.map((section) => ({
      ...section,
      title: section.titleMessage ? translate(section.titleMessage, section.title) : section.title,
      body: presentation(section.body),
    })),
  };
}
