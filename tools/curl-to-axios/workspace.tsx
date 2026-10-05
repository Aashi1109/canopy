"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { useEffect, useId } from "react";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { FieldLabel, SegmentedControl, Select, toast } from "@/components/ui/index.tsx";

const REQUEST_STYLES = [
  { label: "axios.request", value: "request" },
  { label: "Aliases", value: "alias" },
  { label: "axios(config)", value: "config" },
] as const;

export default function CurlToAxiosWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const languageId = useId();
  const moduleId = useId();
  const moduleFormat = typeof props.settings.moduleFormat === "string" ? props.settings.moduleFormat : "none";
  const outputLanguage = props.settings.outputLanguage === "typescript" ? "typescript" : "javascript";
  const requestStyle = typeof props.settings.requestStyle === "string" ? props.settings.requestStyle : "config";

  useEffect(() => {
    props.onToolbarActionsChange?.({ exampleLabel: toolText("workspace.loadExample") });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange, toolText]);

  useEffect(() => {
    if (!props.error) return;
    const notification = toast.error(toolText("workspace.unable_to_convert_54606f"), { description: props.error });
    return () => toast.dismiss(notification);
  }, [props.error, toolText]);

  return (
    <ToolWorkspace
      {...props}
      error={undefined}
      spec={{ ...props.spec, outputLanguage }}
      resultHeaderActions={
        <>
          <FieldLabel className="sr-only" htmlFor={languageId}>
            {toolText("workspace.output_language_bf3bcc")}
          </FieldLabel>
          <Select
            className="w-36"
            disabled={props.disabled}
            id={languageId}
            onChange={(event) => props.onSettingChange("outputLanguage", event.currentTarget.value)}
            size="xs"
            value={outputLanguage}
          >
            <option value="javascript">{toolText("workspace.javascript_b27ad0")}</option>
            <option value="typescript">{toolText("workspace.typescript_ed0504")}</option>
          </Select>
        </>
      }
      renderResult={(result) => (
        // Conversion warnings are already presented by the runtime's shared toast.
        <ResultView result={{ ...result, issues: undefined, verdict: undefined }} language={outputLanguage} />
      )}
      renderSettings={() => (
        <>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor={moduleId}>{toolText("workspace.module_format_ba8e98")}</FieldLabel>
            <Select
              disabled={props.disabled}
              id={moduleId}
              onChange={(event) => props.onSettingChange("moduleFormat", event.currentTarget.value)}
              value={moduleFormat}
            >
              <option value="none">{toolText("workspace.no_import_18a0da")}</option>
              <option value="esm">{toolText("workspace.es_module_import_9044c4")}</option>
              <option value="commonjs">{toolText("workspace.commonjs_require_190f0a")}</option>
            </Select>
          </div>
          <SegmentedControl
            aria-label={toolText("workspace.request_style_71ed43")}
            items={REQUEST_STYLES.map((item) => ({
              ...item,
              label: item.value === "alias" ? toolText("workspace.aliases") : item.label,
              disabled: props.disabled,
            }))}
            onValueChange={(value) => props.onSettingChange("requestStyle", value)}
            size="field"
            value={requestStyle}
          />
        </>
      )}
    />
  );
}
