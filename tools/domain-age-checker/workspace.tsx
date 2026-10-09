"use client";
import { useLocale, useTranslations as useToolTranslations } from "next-intl";

import { Globe, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { ResultSurface } from "@/components/ResultSurface";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ScrollRegion, SettingsStack, Stack } from "@/components/Stacks";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  FieldError,
  FieldLabel,
  H3,
  H4,
  Input,
  Muted,
  P,
  Strong,
  ToolOptionsPanel,
} from "@/components/ui/index.tsx";
import { normalizeDomain } from "@/lib/devtools/shared/url";
import { createDomainSummary } from "./preview";

function DomainSummary({ text }: { text: string }) {
  const toolText = useToolTranslations("Tool.runtime");
  const locale = useLocale();
  const summary = createDomainSummary(text, Date.now(), toolText, locale);

  return (
    <ScrollRegion accessibleName={toolText("workspace.registrationSummary")} className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <div className="space-y-1">
          <H3 className="break-words">{summary.domain}</H3>
          <P>{toolText("workspace.registrationAge", { value: summary.age })}</P>
          <Muted>{summary.ageDetail}</Muted>
        </div>
        <dl className="grid gap-4 border-y border-border py-4 sm:grid-cols-3">
          {summary.dates.map((date) => (
            <div className="min-w-0 space-y-1" key={date.label}>
              <dt>
                <Muted>{date.label}</Muted>
              </dt>
              <dd className="space-y-1">
                <P>
                  <Strong>{date.value}</Strong>
                </P>
                {date.detail ? <Muted>{date.detail}</Muted> : null}
              </dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="space-y-3" aria-label={toolText("workspace.registration_status_3aa459")}>
            <H4>{toolText("workspace.registration_status_3aa459")}</H4>
            {summary.statuses.map((status, index) => (
              <div className="space-y-1" key={`${status.label}-${index}`}>
                <P>
                  <Strong>{status.label}</Strong>
                </P>
                <Muted>{status.detail}</Muted>
              </div>
            ))}
          </section>
          <section className="min-w-0 space-y-3" aria-label={toolText("workspace.nameservers_08c8bf")}>
            <div className="space-y-1">
              <H4>{toolText("workspace.nameservers_08c8bf")}</H4>
              <Muted>{toolText("workspace.these_servers_tell_390067")}</Muted>
            </div>
            {summary.nameservers.length ? (
              <ul className="space-y-1">
                {summary.nameservers.map((name) => (
                  <li key={name}>
                    <P className="break-all">{name}</P>
                  </li>
                ))}
              </ul>
            ) : (
              <P>{toolText("workspace.not_reported_by_fd7afc")}</P>
            )}
          </section>
        </div>
        <Muted>{toolText("workspace.this_record_describes_74f5c9")}</Muted>
      </div>
    </ScrollRegion>
  );
}

export default function DomainAgeWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const inputId = useId();
  const [touched, setTouched] = useState(false);
  const running = Boolean(props.running || props.primaryAction?.running);
  let inputError: string | null = null;
  try {
    normalizeDomain(props.input.text);
  } catch (error) {
    inputError = toolText(props.input.text.trim() ? "workspace.invalidDomain" : "workspace.domainRequired");
  }
  const visibleError = touched ? inputError : null;

  useEffect(() => {
    props.onToolbarActionsChange?.({ primaryActionInWorkspace: true });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange]);

  return (
    <SettingsStack className="h-full" defaultCollapsed="secondary" defaultSize={75} minSize={75}>
      <Stack className="h-full">
        <form
          className="shrink-0 space-y-2 border-b border-border p-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!inputError && !props.disabled && !props.primaryAction?.disabled && !running) {
              props.primaryAction?.onRun();
            }
          }}
        >
          <FieldLabel htmlFor={inputId} required>
            {toolText("workspace.domain_name_421b1e")}
          </FieldLabel>
          <div className="flex min-w-0 items-center gap-2 max-sm:flex-wrap">
            <Input
              aria-describedby={visibleError ? `${inputId}-error` : undefined}
              aria-invalid={Boolean(visibleError)}
              autoCapitalize="none"
              autoComplete="url"
              disabled={props.disabled || running}
              id={inputId}
              inputMode="url"
              leadingIcon={<Globe />}
              maxLength={253}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                setTouched(true);
                props.onInputChange({ ...props.input, text: event.target.value });
              }}
              placeholder="example.com"
              required
              spellCheck={false}
              type="text"
              value={props.input.text}
            />
            {running && props.primaryAction?.onCancel ? (
              <Button
                onClick={(event) => {
                  event.preventDefault();
                  props.primaryAction?.onCancel?.();
                }}
                type="button"
                variant="outline"
              >
                {toolText("workspace.cancel_19766e")}
              </Button>
            ) : (
              <Button
                aria-busy={running || undefined}
                disabled={
                  props.disabled ||
                  !props.primaryAction ||
                  props.primaryAction.disabled ||
                  running ||
                  Boolean(inputError)
                }
                type="submit"
              >
                <Search aria-hidden="true" />
                {running
                  ? toolText("workspace.checking_domain_89c2b4")
                  : (props.primaryAction?.label ?? toolText("workspace.checkAge"))}
              </Button>
            )}
          </div>
          {visibleError ? <FieldError id={`${inputId}-error`}>{visibleError}</FieldError> : null}
        </form>
        <div className="min-h-0 flex-1 p-4">
          <ResultSurface
            error={props.error}
            renderPreview={(result) => (result.render === "text" ? <DomainSummary text={result.text} /> : null)}
            result={props.result}
            running={running}
            spec={props.spec}
            title={toolText("workspace.domain_registration_3a4fce")}
            variant="card"
          />
        </div>
      </Stack>
      <ToolOptionsPanel
        className="h-full overflow-y-auto bg-card p-[18px]"
        title={toolText("workspace.settings_02f6ea")}
        variant="plain"
      >
        <SettingsPanel
          disabled={props.disabled}
          onChange={props.onSettingChange}
          pane="side"
          spec={props.spec.settings}
          values={props.settings}
        />
      </ToolOptionsPanel>
    </SettingsStack>
  );
}
