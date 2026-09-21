"use client";

import { useId } from "react";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { FieldLabel } from "@/components/ui/index.tsx";

export default function MetaTagWorkspace(props: WorkspaceProps) {
  const outputId = useId();

  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.render === "text" ? (
          <>
            <FieldLabel className="sr-only" htmlFor={outputId}>
              Generated meta tags
            </FieldLabel>
            <SourceTextarea
              aria-label="Generated meta tags"
              className="min-h-0 flex-1"
              id={outputId}
              language="html"
              onChange={() => undefined}
              readOnly
              value={result.text}
              wrap="off"
            />
          </>
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
