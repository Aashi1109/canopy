"use client";

import { useId, useMemo } from "react";

import codeStyles from "@/components/content/codeHighlight.module.css";
import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { FieldLabel } from "@/components/ui/index.tsx";
import { highlightCode } from "@/lib/markdown/codeHighlight";

export default function MetaTagWorkspace(props: WorkspaceProps) {
  const outputId = useId();
  const output = props.result?.render === "text" ? props.result.text : "";
  const highlightedOutput = useMemo(() => highlightCode(output, "html"), [output]);

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
              className="min-h-0 flex-1"
              highlightedValue={
                <span
                  className={`${codeStyles.highlight} [&_.hljs-name]:text-primary`}
                  dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                />
              }
              id={outputId}
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
