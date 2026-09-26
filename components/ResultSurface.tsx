"use client";

import { Code2, Eye, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";

import { getResultCount, ResultActions, ResultView, type ResultViewProps } from "@/components/ResultView";
import { WorkspaceSurface } from "@/components/Surfaces";
import { Button, ButtonGroup, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";
import type { ToolSpec } from "@/lib/tool-framework/spec";

export interface ResultSurfaceProps {
  colorPreviews?: boolean;
  downloadMenu?: boolean;
  error?: string;
  /** Tool controls that remain available before a result exists. */
  headerActions?: ReactNode;
  initialJsonView?: ResultViewProps["initialJsonView"];
  result: ToolResult | null;
  /** Display-only snapshot while a replacement is prepared; never used for export actions. */
  retainedResult?: ToolResult | null;
  /** Tool-owned readable preview; Raw and export actions retain the original result. */
  renderPreview?: (result: ToolResult) => ReactNode;
  renderResult?: (result: ToolResult) => ReactNode;
  renderResultActions?: (result: ToolResult) => ReactNode;
  running?: boolean;
  spec: ToolSpec;
  title?: string;
  variant?: "card" | "panel";
}

export function ResultSurface({
  colorPreviews = false,
  downloadMenu = false,
  error,
  headerActions,
  initialJsonView,
  result,
  retainedResult,
  renderPreview,
  renderResult,
  renderResultActions,
  running = false,
  spec,
  title = "Result",
  variant,
}: ResultSurfaceProps) {
  const [resultView, setResultView] = useState<"raw" | "preview">(spec.resultView?.default ?? "raw");
  const resultViews = spec.resultView?.default === "preview" ? ["preview", "raw"] : ["raw", "preview"];
  const visibleResult = result ?? retainedResult;
  const tablePreview =
    !renderResult && visibleResult && "tablePreview" in visibleResult ? visibleResult.tablePreview : undefined;
  const jsonPreview =
    !renderResult && visibleResult && "jsonPreview" in visibleResult ? visibleResult.jsonPreview : undefined;
  const structuredPreview = tablePreview ?? jsonPreview;
  const htmlResultPreview =
    !renderResult && Boolean(spec.resultView) && visibleResult?.render === "html" && !structuredPreview;
  const showingJsonPreview = Boolean(jsonPreview && resultView === "preview");
  const htmlTablePreview =
    spec.previewLayout === "table" &&
    (visibleResult?.render === "html" || (visibleResult?.render === "code" && visibleResult.language === "html"));
  const markdownPreview =
    !renderResult &&
    ((visibleResult?.render === "text" && spec.outputLanguage === "markdown") ||
      (visibleResult?.render === "code" && visibleResult.language === "markdown"));
  const hasPreview = Boolean(
    (visibleResult && renderPreview) || structuredPreview || markdownPreview || htmlResultPreview,
  );
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
        : `${resultCount} ${result?.render === "table" ? "ROWS" : "READY"}`;
  const jsonActionsInHeader = result?.render === "json-tree" && (variant === "card" || hasPreview);
  const fileActionsInHeader =
    visibleResult?.render === "files" &&
    visibleResult.files.length === 1 &&
    Boolean(spec.capabilities?.download) &&
    !downloadMenu &&
    !renderResultActions;
  const hasResultActions =
    fileActionsInHeader ||
    (result?.render !== "files" &&
      Boolean(
        jsonActionsInHeader ||
        (result?.render !== "json-tree" && (spec.capabilities?.copy || spec.capabilities?.download)),
      ));
  const jsonHeader =
    result?.render === "json-tree" && !jsonActionsInHeader ? <span className="sr-only">{title}</span> : undefined;
  const content = visibleResult ? (
    renderPreview && resultView === "preview" ? (
      renderPreview(visibleResult)
    ) : renderResult ? (
      renderResult(visibleResult)
    ) : (
      <ResultView
        colorPreviews={colorPreviews}
        hideArtifacts={downloadMenu}
        hideFileActions={fileActionsInHeader}
        hideJsonHeader={jsonActionsInHeader || showingJsonPreview}
        hideStats={spec.resultStats === "status-only"}
        htmlPreview={htmlTablePreview && resultView === "raw"}
        initialJsonView={showingJsonPreview ? "read-only" : initialJsonView}
        jsonHeader={jsonHeader}
        language={spec.outputLanguage}
        showLineNumbers={spec.outputShowLineNumbers}
        markdownPreview={markdownPreview && resultView === "preview"}
        previewLayout={spec.previewLayout}
        result={
          structuredPreview && resultView === "preview"
            ? { ...visibleResult, ...structuredPreview }
            : htmlResultPreview && resultView === "raw" && visibleResult.render === "html"
              ? { ...visibleResult, render: "code", code: visibleResult.html, language: "html" }
              : visibleResult
        }
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
          headerActions || hasPreview || (result && renderResultActions) || hasResultActions ? (
            <>
              {headerActions}
              {hasPreview ? (
                <TabsList asChild className="mr-2 gap-0 border-0 p-0">
                  <ButtonGroup aria-label="Result view">
                    {resultViews.map((view) => (
                      <Button
                        asChild
                        key={view}
                        variant="outline"
                        size="sm"
                        className="data-[state=active]:bg-accent data-[state=active]:text-primary"
                      >
                        <TabsTrigger value={view} className="flex-none after:hidden">
                          {view === "raw" ? <Code2 aria-hidden="true" /> : <Eye aria-hidden="true" />}
                          {view === "raw"
                            ? "Raw"
                            : (spec.resultView?.previewLabel ??
                              (jsonPreview ? "Tree" : tablePreview && !htmlTablePreview ? "Table" : "Preview"))}
                        </TabsTrigger>
                      </Button>
                    ))}
                  </ButtonGroup>
                </TabsList>
              ) : null}
              {result && renderResultActions ? (
                renderResultActions(result)
              ) : hasResultActions ? (
                <ResultActions
                  canCopy={jsonActionsInHeader || Boolean(spec.capabilities?.copy)}
                  canDownload={jsonActionsInHeader || Boolean(spec.capabilities?.download)}
                  downloadMenu={downloadMenu}
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
        metaPosition={hasPreview && !updateStatus ? "actions" : "start"}
        purpose="result"
        state={state}
        stateDescription={error ?? (running ? spec.labels.running : spec.labels.empty)}
        stateIcon={running ? <Upload aria-hidden="true" className="animate-pulse" /> : undefined}
        stateTitle={error ? "Unable to create the result" : running ? spec.labels.running : "Result will appear here"}
        status={
          updateStatus ? undefined : state === "ready" ? (
            variant === "card" || (hasPreview && resultCount === null) ? undefined : (
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
          ? resultViews.map((view) => (
              <TabsContent className="min-h-0 flex-col data-[state=active]:flex" key={view} value={view}>
                {content}
              </TabsContent>
            ))
          : content}
      </WorkspaceSurface>
    </Tabs>
  );
}
