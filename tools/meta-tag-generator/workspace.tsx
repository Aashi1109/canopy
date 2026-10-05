"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { useId } from "react";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { FieldLabel } from "@/components/ui/index.tsx";

export default function MetaTagWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const outputId = useId();

  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.render === "text" ? (
          <>
            <FieldLabel className="sr-only" htmlFor={outputId}>
              {toolText("workspace.generated_meta_tags_d04091")}
            </FieldLabel>
            <SourceTextarea
              aria-label={toolText("workspace.generated_meta_tags_d04091")}
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
