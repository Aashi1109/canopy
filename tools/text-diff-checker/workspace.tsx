"use client";

import { useTranslations } from "next-intl";

import { DiffWorkspace } from "@/components/DiffWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";

export default function TextDiffWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  return <DiffWorkspace {...props} editLabel={t("workspace.editText")} />;
}
