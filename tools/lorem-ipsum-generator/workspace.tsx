"use client";

import { CopyButton, ResultView } from "@/components/ResultView";
import { GeneratedList } from "@/components/Surfaces";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function LoremIpsumWorkspace(props: WorkspaceProps) {
  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.render === "text" ? (
          <GeneratedList
            getId={(item) => String(item.index)}
            getLabel={(item) => String(item.index + 1).padStart(2, "0")}
            getValue={(item) => item.text}
            items={result.text.split("\n\n").map((text, index) => ({ text, index }))}
            renderAction={(item) => (
              <CopyButton content={item.text} iconOnly label={`Copy paragraph ${item.index + 1}`} />
            )}
            variant="text"
          />
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
