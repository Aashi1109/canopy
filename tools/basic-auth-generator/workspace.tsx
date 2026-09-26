"use client";

import { ResultView } from "@/components/ResultView";
import { Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { Muted, P } from "@/components/ui/index.tsx";

const FORMAT_HELP: Record<string, string> = {
  header: "Copy this complete Authorization header into your HTTP client.",
  value: "Use this value for a header named Authorization. The Basic prefix is included.",
  base64:
    "This is the encoded username:password token. Add Basic followed by a space when using it as an Authorization header value.",
  curl: "Replace https://example.com/api with your HTTPS endpoint, then run the command in your terminal.",
  fetch:
    "Replace https://example.com/api with your HTTPS endpoint. Browser requests to another origin require the server to allow CORS.",
};

export default function BasicAuthWorkspace(props: WorkspaceProps) {
  const format = typeof props.settings.format === "string" ? props.settings.format : "header";
  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) => (
        <Stack className="min-h-0 flex-1" gap="none">
          <div className="space-y-2 border-b border-border p-4">
            <P>{FORMAT_HELP[format] ?? FORMAT_HELP.header}</P>
            <Muted>Base64 is reversible. Treat this output as a password and use HTTPS.</Muted>
          </div>
          <ResultView result={result} />
        </Stack>
      )}
    />
  );
}
