"use client";

import { useEffect, useMemo } from "react";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { KeyValueFields } from "@/components/ui/index.tsx";
import type { SettingRow } from "@/lib/tool-framework/settings";
import { getParameterErrors } from "./parameters";

export default function UtmBuilderWorkspace(props: WorkspaceProps) {
  const fields = props.spec.settings.fields;
  const parameters = useMemo(() => {
    const value = props.settings.parameters;
    return Array.isArray(value)
      ? value.filter(
          (row): row is SettingRow =>
            typeof row === "object" && row !== null && typeof row.key === "string" && typeof row.value === "string",
        )
      : [];
  }, [props.settings.parameters]);
  const errors = getParameterErrors(parameters);
  const validation = errors.find(Boolean) ?? null;
  const { onValidationChange } = props;
  useEffect(() => {
    onValidationChange?.(validation);
    return () => onValidationChange?.(null);
  }, [onValidationChange, validation]);

  const onSubmit = () => {
    if (!validation && props.primaryAction && !props.primaryAction.disabled && !props.primaryAction.running) {
      props.primaryAction.onRun();
    }
  };

  return (
    <ToolWorkspace
      {...props}
      result={validation ? null : props.result}
      spec={{
        ...props.spec,
        input: {
          kind: "fields",
          label: "Campaign details",
          fields: [
            {
              channel: "text",
              label: fields.url.label,
              placeholder: "https://example.com/landing-page",
              required: true,
            },
          ],
        },
      }}
      input={{ ...props.input, text: typeof props.settings.url === "string" ? props.settings.url : "" }}
      onInputChange={(input) => props.onSettingChange("url", input.text)}
      onInputSubmit={onSubmit}
      renderInputSettings={() => (
        <div className="@container space-y-4">
          <SettingsPanel
            className="grid-cols-1 gap-3 @min-[24rem]:grid-cols-2"
            disabled={props.disabled}
            layout="grid"
            onChange={props.onSettingChange}
            onSubmit={onSubmit}
            spec={{
              fields: {
                campaign: fields.campaign,
                source: fields.source,
                medium: fields.medium,
                term: fields.term,
                content: fields.content,
              },
            }}
            values={props.settings}
          />
          <KeyValueFields
            addLabel="Add parameter"
            disabled={props.disabled}
            errors={errors}
            help={fields.parameters.help}
            keyLabel="Parameter key"
            keyPlaceholder="e.g. utm_id"
            label={fields.parameters.label}
            onChange={(rows) => props.onSettingChange("parameters", rows)}
            onSubmit={onSubmit}
            rowLabel="parameter"
            rows={parameters}
            valueLabel="Parameter value"
            valuePlaceholder="e.g. spring_2026"
          />
        </div>
      )}
    />
  );
}
