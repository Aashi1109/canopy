"use client";

import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { CodeBlock, H2, H3, Muted, P, StatusBadge } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";
import { getExpirationSummary } from "./result";

const STATUS = {
  active: {
    label: "Not expired",
    title: "Within its time window",
    description: "At the last check, the expiration time was in the future and any not-before restriction had passed.",
    variant: "success",
  },
  expired: {
    label: "Expired",
    title: "Token has expired",
    description:
      "The expiration time has passed. Obtain a new token through your application's sign-in or refresh flow.",
    variant: "danger",
  },
  "not-active": {
    label: "Not active yet",
    title: "Not active yet",
    description: "The not-before time is still in the future. The token must not be accepted before that time.",
    variant: "warning",
  },
  "expiring-soon": {
    label: "Expiring soon",
    title: "Expiration is near",
    description:
      "At the last check, this token had five minutes or less remaining. Use your application's refresh flow if needed.",
    variant: "warning",
  },
  "no-expiration": {
    label: "No exp claim",
    title: "No expiration specified",
    description:
      "This payload has no exp claim, so its expiration cannot be determined. This does not mean the token will remain accepted indefinitely.",
    variant: "warning",
  },
} as const;

function ExpirationSummary({ result }: { result: ToolResult }) {
  const summary = getExpirationSummary(result);
  if (!summary) return <ResultView result={result} />;

  const status = STATUS[summary.state];
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
    ...(summary.useLocalTime ? {} : { timeZone: "UTC" }),
  });
  const formatDate = (seconds: number) => dateFormatter.format(new Date(seconds * 1000));
  const timestamps = [
    { label: "Expires at", claim: "exp", value: summary.expiresAt, missing: "Not specified" },
    { label: "Not valid before", claim: "nbf", value: summary.notBefore, missing: "No restriction specified" },
    { label: "Issued at", claim: "iat", value: summary.issuedAt, missing: "Not specified" },
  ];
  const payload = summary.payload ? JSON.stringify(summary.payload, null, 2) : undefined;

  return (
    <ScrollRegion accessibleName="JWT expiration summary" className="min-h-0 flex-1">
      <div className="@container space-y-6 p-5">
        <section aria-label="Expiration status" className="space-y-3">
          <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
          <H2>{status.title}</H2>
          <P className="max-w-3xl">{status.description}</P>
        </section>

        <section aria-label="Token timestamps" className="border-y border-border py-4">
          <Stack direction="row" align="center" justify="between" gap="sm" wrap>
            <H3>Token timestamps</H3>
            <Muted>{summary.useLocalTime ? `Local time · ${dateFormatter.resolvedOptions().timeZone}` : "UTC"}</Muted>
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
          <P>Signature not verified. Time claims alone do not establish that a token is valid or trusted.</P>
          <Muted>
            Checked {formatDate(summary.checkedAt)} using your device clock, with no clock-skew allowance. Run Check
            expiration again to refresh.
          </Muted>
        </div>

        {payload !== undefined ? (
          <section aria-label="Decoded payload" className="space-y-3 border-t border-border pt-5">
            <Stack direction="row" align="center" justify="between" gap="sm">
              <div>
                <H3>Decoded payload</H3>
                <Muted>Unverified claims</Muted>
              </div>
              <CopyButton content={payload} iconOnly label="Copy payload JSON" />
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
