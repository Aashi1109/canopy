"use client";

import { Caption, CodeBlock, Overline, Button } from "@/components/ui/index.tsx";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { Check, Clipboard, Code2 } from "lucide-react";
import { useState, type ReactElement } from "react";

export function DeveloperHandoff({ command }: { readonly command: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl bg-surface-ink text-on-ink shadow-[0_12px_36px_#0000001a]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <Overline className="flex items-center gap-2 text-on-ink-muted">
          <Code2 aria-hidden="true" className="size-4 text-primary" />
          Developer handoff
        </Overline>
        <Button
          aria-label="Copy scaffold command"
          className="border-white/15 bg-white/10 text-on-ink hover:bg-white/15"
          onClick={copy}
          size="icon-xs"
          type="button"
          variant="secondary"
        >
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        </Button>
      </div>
      <CodeBlock className="block overflow-x-auto whitespace-pre bg-card px-4 py-5 text-foreground">
        <SyntaxHighlight code={command} language="bash" />
      </CodeBlock>
      <Caption className="block border-t border-white/10 px-4 py-3 text-on-ink-muted">
        Run locally, implement the generated definition and execution file, then deploy. The saved database
        configuration survives the seed.
      </Caption>
    </section>
  );
}
