"use client";

import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";

export default function UuidWorkspace(props: WorkspaceProps) {
  const nameBased = props.settings.version === "v3" || props.settings.version === "v5";
  const fields = Object.fromEntries(
    Object.entries(props.spec.settings.fields).filter(([key]) => {
      if (key === "namespace" || key === "name") return nameBased;
      if (key === "customNamespace") return nameBased && props.settings.namespace === "custom";
      if (key === "count") return !nameBased;
      return true;
    }),
  );

  return <ToolWorkspace {...props} spec={{ ...props.spec, settings: { fields } }} />;
}
