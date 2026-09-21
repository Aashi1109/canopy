"use client";

import { Upload } from "lucide-react";
import type { ReactNode } from "react";

import { getResultCount, ResultActions, ResultView, type ResultViewProps } from "@/components/ResultView";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { ToolResult } from "@/lib/tool-framework/result";
import type { ToolSpec } from "@/lib/tool-framework/spec";

export interface ResultSurfaceProps {
  error?: string;
  initialJsonView?: ResultViewProps["initialJsonView"];
  result: ToolResult | null;
  /** Display-only snapshot while a replacement is prepared; never used for export actions. */
  retainedResult?: ToolResult | null;
  renderResult?: (result: ToolResult) => ReactNode;
  renderResultActions?: (result: ToolResult) => ReactNode;
  running?: boolean;
  spec: ToolSpec;
  title?: string;
  variant?: "card" | "panel";
}

export function ResultSurface({
  error,
  initialJsonView,
  result,
  retainedResult,
  renderResult,
  renderResultActions,
  running = false,
  spec,
  title = "Result",
  variant,
}: ResultSurfaceProps) {
  const visibleResult = result ?? retainedResult;
  const retaining = !result && Boolean(retainedResult);
  const state = error ? "error" : retaining ? "ready" : running ? "loading" : result ? "ready" : "empty";
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
    Boolean(cardJson || (result?.render !== "json-tree" && (spec.capabilities?.copy || spec.capabilities?.download)));
  const jsonHeader = result?.render === "json-tree" && !cardJson ? <span className="sr-only">{title}</span> : undefined;
  return (
    <WorkspaceSurface
      actions={
        result && renderResultActions ? (
          renderResultActions(result)
        ) : hasResultActions ? (
          <ResultActions
            canCopy={cardJson || Boolean(spec.capabilities?.copy)}
            canDownload={cardJson || Boolean(spec.capabilities?.download)}
            result={result}
          />
        ) : undefined
      }
      className="h-full"
      aria-busy={running || undefined}
      header={jsonHeader ? "sr-only" : "visible"}
      purpose="result"
      state={state}
      stateDescription={error ?? (running ? spec.labels.running : spec.labels.empty)}
      stateIcon={running ? <Upload aria-hidden="true" className="animate-pulse" /> : undefined}
      stateTitle={error ? "Unable to create the result" : running ? spec.labels.running : "Result will appear here"}
      status={
        retaining && !error ? (
          <span role="status">{running ? "Updating preview…" : "Preview out of date"}</span>
        ) : state === "ready" ? (
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
      {visibleResult ? (
        renderResult ? (
          renderResult(visibleResult)
        ) : (
          <ResultView
            hideJsonHeader={cardJson}
            initialJsonView={initialJsonView}
            jsonHeader={jsonHeader}
            result={visibleResult}
          />
        )
      ) : null}
    </WorkspaceSurface>
  );
}
