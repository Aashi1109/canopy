"use client";
import { useTranslations } from "next-intl";

import { DiffWorkspace } from "@/components/DiffWorkspace";
import { highlightJson } from "@/components/content/jsonHighlight";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function JsonDiffWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  return (
    <DiffWorkspace
      {...props}
      editLabel={t("comparison.edit")}
      renderLine={highlightJson}
      settingsNote={t("comparison.note")}
    />
  );
}
