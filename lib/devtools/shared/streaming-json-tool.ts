import {
  processStreamingJson,
  type StreamingJsonIndentation,
  type StreamingJsonInput,
  type StreamingJsonMode,
} from "./streaming-json.ts";
import { LARGE_TEXT_PREVIEW_BYTES } from "../../tool-framework/limits.ts";
import type { ToolResult } from "../../tool-framework/result.ts";
import { ToolError, type ToolRunContext } from "../../tool-framework/run.ts";

export const LARGE_JSON_FILE_BYTES = 2_000_000;

export function isLargeJsonRun(ctx: ToolRunContext<unknown>): boolean {
  return (ctx.input.files?.[0]?.size ?? 0) > LARGE_JSON_FILE_BYTES;
}

export function jsonRootType(preview: string): string {
  const value = preview.trimStart();
  if (value.startsWith("{")) return "object";
  if (value.startsWith("[")) return "array";
  if (value.startsWith('"')) return "string";
  if (value.startsWith("true") || value.startsWith("false")) return "boolean";
  if (value.startsWith("null")) return "null";
  return "number";
}

function sourceFor(ctx: ToolRunContext<unknown>): StreamingJsonInput {
  return ctx.input.files?.[0]?.source ?? ctx.input.text;
}

function inputProgress(ctx: ToolRunContext<unknown>) {
  const total = ctx.input.files?.[0]?.size;
  return total
    ? (completed: number) =>
        ctx.progress({
          completed,
          total,
          stage: "Processing JSON",
        })
    : undefined;
}

function throwJsonError(
  error: Extract<Awaited<ReturnType<typeof processStreamingJson>>, { ok: false }>["error"],
): never {
  throw new ToolError(
    `json-${error.kind}`,
    `${error.message} Near line ${error.line}, column ${error.column}.`,
    "Check the reported line for a missing comma, quote, or bracket.",
  );
}

export async function validateStreamingJsonRun(ctx: ToolRunContext<unknown>): Promise<ToolResult> {
  const result = await processStreamingJson(sourceFor(ctx), {
    mode: "validate",
    onInputProgress: inputProgress(ctx),
    previewLimit: LARGE_TEXT_PREVIEW_BYTES,
    signal: ctx.signal,
  });
  if (!result.ok) throwJsonError(result.error);
  return {
    render: "code",
    code: result.preview,
    language: "json",
    truncated: result.previewTruncated,
    stats: [
      { label: "Status", value: "Valid JSON" },
      { label: "Root type", value: result.rootType },
      { label: "Input", value: `${result.inputBytes.toLocaleString("en-US")} bytes` },
    ],
  };
}

export async function transformLargeJsonRun(
  ctx: ToolRunContext<unknown>,
  options: {
    readonly mode: Exclude<StreamingJsonMode, "validate">;
    readonly indentation?: StreamingJsonIndentation;
    readonly name: string;
  },
): Promise<ToolResult> {
  const channel = new TransformStream<Uint8Array, Uint8Array>();
  const artifactPromise = ctx.writeArtifact({
    name: options.name,
    mime: "application/json",
    source: channel.readable,
  });
  void artifactPromise.catch(() => undefined);
  const result = await processStreamingJson(sourceFor(ctx), {
    indentation: options.indentation,
    mode: options.mode,
    onInputProgress: inputProgress(ctx),
    previewLimit: LARGE_TEXT_PREVIEW_BYTES,
    signal: ctx.signal,
    writable: channel.writable,
  });
  if (!result.ok) {
    await artifactPromise.catch(() => undefined);
    throwJsonError(result.error);
  }
  const artifact = await artifactPromise;
  return {
    render: "code",
    code: result.preview,
    language: "json",
    truncated: result.previewTruncated,
    stats: [
      { label: "Input", value: `${result.inputBytes.toLocaleString("en-US")} bytes` },
      { label: "Output", value: `${artifact.size.toLocaleString("en-US")} bytes` },
    ],
    sections: [
      {
        title: result.previewTruncated ? "Complete generated file" : "Download",
        body: {
          render: "files",
          files: [artifact],
          inputBytes: result.inputBytes,
          outputBytes: artifact.size,
        },
      },
    ],
  };
}

export async function transformSmallJson(
  input: string,
  options: {
    readonly mode: Exclude<StreamingJsonMode, "validate">;
    readonly indentation?: StreamingJsonIndentation;
    readonly signal?: AbortSignal;
  },
): Promise<string> {
  let output = "";
  const result = await processStreamingJson(input, {
    indentation: options.indentation,
    mode: options.mode,
    onOutput: (chunk) => {
      output += chunk;
    },
    signal: options.signal,
  });
  if (!result.ok) throwJsonError(result.error);
  return output;
}
