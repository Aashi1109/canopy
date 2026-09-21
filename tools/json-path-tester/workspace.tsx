"use client";

import { useId, useMemo } from "react";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { AutocompleteInput, FieldDescription, FieldLabel } from "@/components/ui/index.tsx";
import { parseUtilityJson } from "@/lib/devtools/shared/json-input";
import { getJsonPathSuggestions } from "./json-path";

export default function JsonPathTesterWorkspace(props: WorkspaceProps) {
  const id = useId();
  const path = typeof props.settings.path === "string" ? props.settings.path : "";
  const repairMode = typeof props.settings.repairMode === "string" ? props.settings.repairMode : "remove";
  const document = useMemo(() => {
    if (!props.input.text.trim()) return null;
    try {
      return { value: parseUtilityJson(props.input.text, { repairMode }) };
    } catch {
      return null;
    }
  }, [props.input.text, repairMode]);
  const suggestions = useMemo(() => (document ? getJsonPathSuggestions(document.value, path) : []), [document, path]);

  return (
    <ToolWorkspace
      {...props}
      renderInputSettings={() => (
        <div className="grid shrink-0 gap-1.5 px-4 pt-4">
          <FieldLabel className="text-muted-foreground" htmlFor={id}>
            JSONPath
          </FieldLabel>
          <AutocompleteInput
            aria-describedby={`${id}-help`}
            code
            disabled={props.disabled}
            id={id}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229 ||
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
              )
                return;
              if (
                event.currentTarget.getAttribute("aria-expanded") === "true" &&
                event.currentTarget.getAttribute("aria-activedescendant")
              )
                return;
              if (!props.primaryAction || props.primaryAction.disabled || props.primaryAction.running) return;
              event.preventDefault();
              props.primaryAction.onRun();
            }}
            onValueChange={(value) => props.onSettingChange("path", value)}
            placeholder="users[0].name"
            suggestions={suggestions}
            value={path}
          />
          <FieldDescription className="text-muted-foreground" id={`${id}-help`}>
            {props.input.text.trim() && !document
              ? "Fix the JSON to see suggestions. The $ root prefix is optional."
              : "Suggestions come from your JSON. The $ root prefix is optional."}
          </FieldDescription>
        </div>
      )}
    />
  );
}
