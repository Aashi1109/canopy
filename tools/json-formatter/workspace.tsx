"use client";

import { JsonResultRenderer } from "@/components/JsonResultRenderer";
import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
export default function JsonFormatterWorkspace(props: WorkspaceProps) {
  const defaultView = (props.settings.operation ?? "format") === "format" ? "read-only" : "code";

  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.render === "json-tree" ? (
          <JsonResultRenderer
            key={defaultView}
            artifactValue={result.text}
            className="h-full"
            defaultOpenDepth={1}
            defaultView={defaultView}
            downloadName={result.downloadName ?? "result.json"}
            formattedValue={result.text}
            maxVisibleEntries={1_000}
            value={result.value}
            views={["code", "read-only"]}
          />
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
