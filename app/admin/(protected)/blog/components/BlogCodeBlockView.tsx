"use client";

import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/index.tsx";
import { MermaidDiagram } from "@/components/content/MermaidDiagram";
import { CopyCode } from "@/components/content/CopyCode";
import codeStyles from "@/components/content/codeHighlight.module.css";

export function BlogCodeBlockView({ node }: NodeViewProps) {
  const [showSource, setShowSource] = useState(false);
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const isMermaid = language.toLowerCase() === "mermaid";

  return (
    <NodeViewWrapper>
      {isMermaid && (
        <div contentEditable={false}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Mermaid diagram</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowSource(!showSource)}>
              {showSource ? "Preview diagram" : "Edit source"}
            </Button>
          </div>
          {!showSource && <MermaidDiagram source={node.textContent} />}
        </div>
      )}
      <div className={codeStyles.codeBlock} hidden={isMermaid && !showSource}>
        <pre>
          <NodeViewContent<"code"> as="code" className={language ? `language-${language}` : undefined} />
        </pre>
        <CopyCode code={node.textContent} />
      </div>
    </NodeViewWrapper>
  );
}
