"use client";

import { Upload } from "lucide-react";

import {
  getResultCount,
  ResultActions,
  ResultView,
  type ResultViewProps,
} from "@/components/ResultView";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { ToolResult } from "@/lib/tool-framework/result";
import type { ToolSpec } from "@/lib/tool-framework/spec";

export interface ResultSurfaceProps {
  error?: string;
  initialJsonView?: ResultViewProps["initialJsonView"];
  result: ToolResult | null;
  running?: boolean;
  spec: ToolSpec;
  title?: string;
  variant?: "card" | "panel";
}

export function ResultSurface({
  error,
  initialJsonView,
  result,
  running = false,
  spec,
  title = "Result",
  variant,
}: ResultSurfaceProps) {
  const state = error ? "error" : running ? "loading" : result ? "ready" : "empty";
  const resultCount = getResultCount(result);
  const resultStatus =
    resultCount === null
      ? "READY"
      : result && "truncated" in result && result.truncated
        ? `${resultCount} SHOWN`
        : `${resultCount} READY`;
  const cardJson = result?.render === "json-tree" && variant === "card";
  const hasResultActions =
    result?.render !== "files" &&
    Boolean(
      cardJson ||
      (result?.render !== "json-tree" && (spec.capabilities?.copy || spec.capabilities?.download)),
    );
  const jsonHeader =
    result?.render === "json-tree" && !cardJson ? (
      <span className="sr-only">{title}</span>
    ) : undefined;
  return (
    <WorkspaceSurface
      actions={
        hasResultActions ? (
          <ResultActions
            canCopy={cardJson || Boolean(spec.capabilities?.copy)}
            canDownload={cardJson || Boolean(spec.capabilities?.download)}
            result={result}
          />
        ) : undefined
      }
      className="h-full"
      header={jsonHeader ? "sr-only" : "visible"}
      purpose="result"
      state={state}
      stateDescription={error ?? (running ? spec.labels.running : spec.labels.empty)}
      stateIcon={running ? <Upload aria-hidden="true" className="animate-pulse" /> : undefined}
      stateTitle={
        error
          ? "Unable to create the result"
          : running
            ? spec.labels.running
            : "Result will appear here"
      }
      status={
        state === "ready" ? (
          variant === "card" ? undefined : (
            <span className="text-foreground">{resultStatus}</span>
          )
        ) : state === "empty" ? (
          variant === "card" ? undefined : (
            <span>0 GENERATED</span>
          )
        ) : undefined
      }
      title={title}
      variant={variant}
    >
      {result ? (
        <ResultView
          hideJsonHeader={cardJson}
          initialJsonView={initialJsonView}
          jsonHeader={jsonHeader}
          result={result}
        />
      ) : null}
    </WorkspaceSurface>
  );
}
