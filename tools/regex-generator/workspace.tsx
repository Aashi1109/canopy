"use client";

import { useId, useMemo } from "react";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { FieldLabel } from "@/components/ui/index.tsx";
import { highlightRegexOutput, type RegexOutputToken } from "./highlighting";

const TOKEN_COLORS: Record<RegexOutputToken["kind"], string> = {
  literal: "text-foreground",
  comment: "text-muted-foreground",
  delimiter: "text-muted-foreground",
  "character-class": "text-syntax-string",
  escape: "text-primary",
  group: "text-primary",
  quantifier: "text-warning",
  anchor: "text-primary",
  alternation: "text-primary",
};

export default function RegexWorkspace(props: WorkspaceProps) {
  const outputId = useId();
  const output = props.result?.render === "text" ? props.result.text : "";
  const tokens = useMemo(() => highlightRegexOutput(output), [output]);

  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.render === "text" ? (
          <>
            <FieldLabel className="sr-only" htmlFor={outputId}>
              Generated regular expression
            </FieldLabel>
            <SourceTextarea
              className="min-h-0 flex-1"
              highlightedValue={tokens.map((token, index) => (
                <span className={TOKEN_COLORS[token.kind]} key={index}>
                  {token.text}
                </span>
              ))}
              id={outputId}
              onChange={() => undefined}
              readOnly
              value={result.text}
            />
          </>
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
