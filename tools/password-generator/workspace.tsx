"use client";

import { useEffect } from "react";

import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function PasswordGeneratorWorkspace(props: WorkspaceProps) {
  const count = Number(props.settings.count) || 1;
  const hasCharacterSet = ["upper", "lower", "numbers", "symbols"].some((key) => props.settings[key] === true);

  useEffect(() => {
    props.onValidationChange?.(hasCharacterSet ? null : "At least one character set must remain enabled.");
  }, [hasCharacterSet, props.onValidationChange]);

  useEffect(() => {
    props.onToolbarActionsChange?.({
      primaryActionLabel: `Generate ${count} ${count === 1 ? "password" : "passwords"}`,
    });
    return () => props.onToolbarActionsChange?.(null);
  }, [count, props.onToolbarActionsChange]);

  return <ToolWorkspace {...props} />;
}
