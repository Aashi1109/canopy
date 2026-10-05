"use client";
import { useLocale, useTranslations as useToolTranslations } from "next-intl";

import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { CodeBlock, H2, H3, Muted, P, StatusBadge } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";
import { getExpirationSummary } from "./result";

const STATUS = {
  active: {
    label: "details.status.active.label",
    title: "details.status.active.title",
    description: "details.status.active.description",
    variant: "success",
  },
  expired: {
    label: "details.status.expired.label",
    title: "details.status.expired.title",
    description: "details.status.expired.description",
    variant: "danger",
  },
  "not-active": {
    label: "details.status.not-active.label",
    title: "details.status.not-active.title",
    description: "details.status.not-active.description",
    variant: "warning",
  },
  "expiring-soon": {
    label: "details.status.expiring-soon.label",
    title: "details.status.expiring-soon.title",
    description: "details.status.expiring-soon.description",
    variant: "warning",
  },
  "no-expiration": {
    label: "details.status.no-expiration.label",
    title: "details.status.no-expiration.title",
    description: "details.status.no-expiration.description",
    variant: "warning",
  },
} as const;

function ExpirationSummary({ result }: { result: ToolResult }) {
  const toolText = useToolTranslations("Tool.runtime");
  const locale = useLocale();
  const summary = getExpirationSummary(result);
  if (!summary) return <ResultView result={result} />;

  const status = STATUS[summary.state];
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "long",
    ...(summary.useLocalTime ? {} : { timeZone: "UTC" }),
  });
  const formatDate = (seconds: number) => dateFormatter.format(new Date(seconds * 1000));
  const timestamps = [
    {
      label: toolText("workspace.expires_at_b613b9"),
      claim: "exp",
      value: summary.expiresAt,
      missing: toolText("summary.notSpecified"),
    },
    {
      label: toolText("workspace.not_valid_before_03d76d"),
      claim: "nbf",
      value: summary.notBefore,
      missing: toolText("summary.noRestriction"),
    },
    {
      label: toolText("workspace.issued_at_f91a82"),
      claim: "iat",
      value: summary.issuedAt,
      missing: toolText("summary.notSpecified"),
    },
  ];
  const payload = summary.payload ? JSON.stringify(summary.payload, null, 2) : undefined;

  return (
    <ScrollRegion accessibleName={toolText("summary.region")} className="min-h-0 flex-1">
      <div className="@container space-y-6 p-5">
        <section aria-label={toolText("workspace.expiration_status_4108ab")} className="space-y-3">
          <StatusBadge variant={status.variant}>{toolText(status.label)}</StatusBadge>
          <H2>{toolText(status.title)}</H2>
          <P className="max-w-3xl">{toolText(status.description)}</P>
        </section>

        <section aria-label={toolText("workspace.token_timestamps_1a99b0")} className="border-y border-border py-4">
          <Stack direction="row" align="center" justify="between" gap="sm" wrap>
            <H3>{toolText("workspace.token_timestamps_1a99b0")}</H3>
            <Muted>
              {summary.useLocalTime
                ? toolText("summary.localTime", { timezone: dateFormatter.resolvedOptions().timeZone })
                : toolText("workspace.utc_7e5f76")}
            </Muted>
          </Stack>
          <dl className="mt-2 divide-y divide-border">
            {timestamps.map(({ label, claim, value, missing }) => (
              <div
                key={claim}
                className="grid gap-1 py-3 @min-[28rem]:grid-cols-[9rem_minmax(0,1fr)] @min-[28rem]:gap-4"
              >
                <dt>
                  <P>
                    {label} <span className="text-muted-foreground">({claim})</span>
                  </P>
                </dt>
                <dd className="min-w-0">
                  {value === null ? (
                    <Muted>{missing}</Muted>
                  ) : (
                    <P className="break-words tabular-nums">
                      <time dateTime={new Date(value * 1000).toISOString()}>{formatDate(value)}</time>
                    </P>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="space-y-2">
          <P>{toolText("workspace.signature_not_verified_9d24d5")}</P>
          <Muted>{toolText("summary.checked", { time: formatDate(summary.checkedAt) })}</Muted>
        </div>

        {payload !== undefined ? (
          <section
            aria-label={toolText("workspace.decoded_payload_76534c")}
            className="space-y-3 border-t border-border pt-5"
          >
            <Stack direction="row" align="center" justify="between" gap="sm">
              <div>
                <H3>{toolText("workspace.decoded_payload_76534c")}</H3>
                <Muted>{toolText("workspace.unverified_claims_749f74")}</Muted>
              </div>
              <CopyButton content={payload} iconOnly label={toolText("workspace.copy_payload_json_d88b52")} />
            </Stack>
            <CodeBlock className="whitespace-pre-wrap break-words">
              <SyntaxHighlight code={payload} language="json" />
            </CodeBlock>
          </section>
        ) : null}
      </div>
    </ScrollRegion>
  );
}

export default function JwtExpirationWorkspace(props: WorkspaceProps) {
  return <ToolWorkspace {...props} renderPreview={(result) => <ExpirationSummary result={result} />} />;
}
