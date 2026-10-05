"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { ResultView } from "@/components/ResultView";
import { Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { Muted, P } from "@/components/ui/index.tsx";

const FORMAT_HELP = { header: true, value: true, base64: true, curl: true, fetch: true };

export default function BasicAuthWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const format = typeof props.settings.format === "string" ? props.settings.format : "header";
  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) => (
        <Stack className="min-h-0 flex-1" gap="none">
          <div className="space-y-2 border-b border-border p-4">
            <P>{toolText(`workspace.formatHelp.${Object.hasOwn(FORMAT_HELP, format) ? format : "header"}`)}</P>
            <Muted>{toolText("workspace.base64_is_reversible_ac9bab")}</Muted>
          </div>
          <ResultView result={result} />
        </Stack>
      )}
    />
  );
}
