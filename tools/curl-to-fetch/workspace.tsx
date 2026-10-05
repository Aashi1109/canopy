"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { useId } from "react";

import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { FieldLabel, Select } from "@/components/ui/index.tsx";

export default function CurlToFetchWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const languageId = useId();
  const outputLanguage = props.settings.outputLanguage === "typescript" ? "typescript" : "javascript";
  const { outputLanguage: _outputLanguage, ...fields } = props.spec.settings.fields;

  return (
    <ToolWorkspace
      {...props}
      spec={{ ...props.spec, outputLanguage, settings: { ...props.spec.settings, fields } }}
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
    />
  );
}
