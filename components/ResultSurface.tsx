"use client";

import { Upload } from "lucide-react";
import { type ReactNode, useState } from "react";

import { getResultCount, ResultActions, ResultView, type ResultViewProps } from "@/components/ResultView";
import { WorkspaceSurface } from "@/components/Surfaces";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/index.tsx";
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
  const [resultView, setResultView] = useState<"raw" | "preview">("raw");
  const visibleResult = result ?? retainedResult;
  const tablePreview =
    !renderResult && visibleResult && "tablePreview" in visibleResult ? visibleResult.tablePreview : undefined;
  const htmlTablePreview =
    spec.previewLayout === "table" &&
    (visibleResult?.render === "html" || (visibleResult?.render === "code" && visibleResult.language === "html"));
  const markdownPreview =
    !renderResult &&
    ((visibleResult?.render === "text" && spec.outputLanguage === "markdown") ||
      (visibleResult?.render === "code" && visibleResult.language === "markdown"));
  const hasPreview = Boolean(tablePreview || markdownPreview);
  const retaining = !result && Boolean(retainedResult);
  const state = visibleResult ? "ready" : error ? "error" : running ? "loading" : "empty";
  const updateStatus = visibleResult
    ? error
      ? "Update failed · Showing previous result"
      : running
        ? "Updating…"
        : retaining
          ? "Preview out of date"
          : null
    : null;
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
  const content = visibleResult ? (
    renderResult ? (
      renderResult(visibleResult)
    ) : (
      <ResultView
        hideJsonHeader={cardJson}
        hideStats={spec.resultStats === "status-only"}
        htmlPreview={htmlTablePreview && resultView === "raw"}
        initialJsonView={initialJsonView}
        jsonHeader={jsonHeader}
        language={spec.outputLanguage}
        markdownPreview={markdownPreview && resultView === "preview"}
        previewLayout={spec.previewLayout}
        result={tablePreview && resultView === "preview" ? { ...visibleResult, ...tablePreview } : visibleResult}
      />
    )
  ) : null;
  return (
    <Tabs
      className="h-full min-h-0"
      onValueChange={(value) => setResultView(value === "preview" ? "preview" : "raw")}
      value={resultView}
    >
      <WorkspaceSurface
        actions={
          hasPreview || (result && renderResultActions) || hasResultActions ? (
            <>
              {hasPreview ? (
                <TabsList aria-label="Result view" variant="pills">
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                  <TabsTrigger value="preview">{tablePreview && !htmlTablePreview ? "Table" : "Preview"}</TabsTrigger>
                </TabsList>
              ) : null}
              {result && renderResultActions ? (
                renderResultActions(result)
              ) : hasResultActions ? (
                <ResultActions
                  canCopy={cardJson || Boolean(spec.capabilities?.copy)}
                  canDownload={cardJson || Boolean(spec.capabilities?.download)}
                  result={result}
                />
              ) : null}
            </>
          ) : undefined
        }
        className="h-full"
        aria-busy={running || undefined}
        header={jsonHeader && !updateStatus ? "sr-only" : "visible"}
        meta={
          updateStatus ? (
            <span className={error ? "text-destructive" : "text-muted-foreground"} role="status">
              {updateStatus}
            </span>
          ) : undefined
        }
        metaPosition="start"
        purpose="result"
        state={state}
        stateDescription={error ?? (running ? spec.labels.running : spec.labels.empty)}
        stateIcon={running ? <Upload aria-hidden="true" className="animate-pulse" /> : undefined}
        stateTitle={error ? "Unable to create the result" : running ? spec.labels.running : "Result will appear here"}
        status={
          updateStatus ? undefined : state === "ready" ? (
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
        {hasPreview
          ? ["raw", "preview"].map((view) => (
              <TabsContent className="min-h-0 flex-col data-[state=active]:flex" key={view} value={view}>
                {content}
              </TabsContent>
            ))
          : content}
      </WorkspaceSurface>
    </Tabs>
  );
}
