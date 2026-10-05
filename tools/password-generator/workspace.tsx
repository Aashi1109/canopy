"use client";
import { useTranslations } from "next-intl";

import { useEffect } from "react";

import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function PasswordGeneratorWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  const count = Number(props.settings.count) || 1;
  const hasCharacterSet = ["upper", "lower", "numbers", "symbols"].some((key) => props.settings[key] === true);

  useEffect(() => {
    props.onValidationChange?.(hasCharacterSet ? null : t("workspace.characterSetRequired"));
  }, [hasCharacterSet, props.onValidationChange, t]);

  useEffect(() => {
    props.onToolbarActionsChange?.({
      primaryActionLabel: t("workspace.generate", { count }),
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [count, props.onToolbarActionsChange, t]);

  return <ToolWorkspace {...props} />;
}
