"use client";

import { useTranslations } from "next-intl";

import { useId } from "react";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { FieldDescription, FieldLabel, Select, Switch } from "@/components/ui/index.tsx";

export default function RobotsTxtWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  const id = useId();
  const fields = props.spec.settings.fields;
  const allowAll = props.settings.allowAll === true;
  const onSubmit = () => {
    if (props.primaryAction && !props.primaryAction.disabled && !props.primaryAction.running) {
      props.primaryAction.onRun();
    }
  };
  const settingsProps = {
    disabled: props.disabled,
    onChange: props.onSettingChange,
    onSubmit,
    values: props.settings,
  };

  return (
    <ToolWorkspace
      {...props}
      inputSurfaceTitle={t("workspace.crawlerRules")}
      sourceClassName="min-h-24"
      renderInputContent={(source) => (
        <Stack className="@container grow shrink-0 p-4" gap="md">
          <div className="grid shrink-0 gap-1.5">
            <FieldLabel htmlFor={`${id}-user-agent`}>{fields.userAgent.label}</FieldLabel>
            <Select
              disabled={props.disabled}
              id={`${id}-user-agent`}
              onChange={(event) => props.onSettingChange("userAgent", event.currentTarget.value)}
              value={typeof props.settings.userAgent === "string" ? props.settings.userAgent : "*"}
            >
              {fields.userAgent.kind === "select" &&
                fields.userAgent.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {source}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldDescription id={`${id}-disallow-paths-help`}>
                {allowAll ? t("workspace.disallowIgnored") : t("workspace.onePath")}
              </FieldDescription>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor={`${id}-allow-all`}>{fields.allowAll.label}</FieldLabel>
                <Switch
                  aria-describedby={`${id}-disallow-paths-help`}
                  checked={allowAll}
                  disabled={props.disabled}
                  id={`${id}-allow-all`}
                  onCheckedChange={(value) => props.onSettingChange("allowAll", value)}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <FieldLabel htmlFor={`${id}-allow-paths`}>{fields.allowPaths.label}</FieldLabel>
            <SourceTextarea
              aria-label={fields.allowPaths.label}
              aria-describedby={`${id}-allow-paths-help`}
              className="min-h-24 flex-1"
              disabled={props.disabled}
              id={`${id}-allow-paths`}
              onChange={(value) => props.onSettingChange("allowPaths", value)}
              placeholder={"/public\n/assets"}
              showLineNumbers={false}
              surface="card"
              value={typeof props.settings.allowPaths === "string" ? props.settings.allowPaths : ""}
            />
            <FieldDescription id={`${id}-allow-paths-help`}>
              {t("workspace.onePathPerLineStartingWith")}
            </FieldDescription>
          </div>
          <div className="shrink-0 space-y-2 border-t border-border pt-4">
            <SettingsPanel
              {...settingsProps}
              className="grid-cols-1 @min-[24rem]:grid-cols-[minmax(0,1fr)_7rem]"
              layout="grid"
              spec={{
                fields: {
                  sitemap: { ...fields.sitemap, help: t("workspace.sitemapHelp") },
                  crawlDelay: { ...fields.crawlDelay, help: t("workspace.delayHelp") },
                },
              }}
            />
            <FieldDescription>{t("workspace.googlebotIgnoresCrawlDelay")}</FieldDescription>
          </div>
        </Stack>
      )}
    />
  );
}
