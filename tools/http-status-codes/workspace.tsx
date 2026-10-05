"use client";
import { useTranslations as useToolTranslations } from "next-intl";

import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { Display, H2, H3, Muted, P, StatusBadge, TextLink } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";

const CATEGORIES = {
  "1": { label: "details.categories.1.label", variant: "neutral" },
  "2": { label: "details.categories.2.label", variant: "success" },
  "3": { label: "details.categories.3.label", variant: "info" },
  "4": { label: "details.categories.4.label", variant: "warning" },
  "5": { label: "details.categories.5.label", variant: "danger" },
} as const;

// Original summaries of RFC 9110, with rate limiting defined in RFC 6585.
const STATUS_DETAILS: Record<string, { meaning: string; next: string; section: string }> = {
  "100": {
    meaning: "details.status_details.100.meaning",
    next: "details.status_details.100.next",
    section: "15.2.1",
  },
  "101": {
    meaning: "details.status_details.101.meaning",
    next: "details.status_details.101.next",
    section: "15.2.2",
  },
  "200": {
    meaning: "details.status_details.200.meaning",
    next: "details.status_details.200.next",
    section: "15.3.1",
  },
  "201": {
    meaning: "details.status_details.201.meaning",
    next: "details.status_details.201.next",
    section: "15.3.2",
  },
  "202": {
    meaning: "details.status_details.202.meaning",
    next: "details.status_details.202.next",
    section: "15.3.3",
  },
  "204": {
    meaning: "details.status_details.204.meaning",
    next: "details.status_details.204.next",
    section: "15.3.5",
  },
  "206": {
    meaning: "details.status_details.206.meaning",
    next: "details.status_details.206.next",
    section: "15.3.7",
  },
  "301": {
    meaning: "details.status_details.301.meaning",
    next: "details.status_details.301.next",
    section: "15.4.2",
  },
  "302": {
    meaning: "details.status_details.302.meaning",
    next: "details.status_details.302.next",
    section: "15.4.3",
  },
  "304": {
    meaning: "details.status_details.304.meaning",
    next: "details.status_details.304.next",
    section: "15.4.5",
  },
  "307": {
    meaning: "details.status_details.307.meaning",
    next: "details.status_details.307.next",
    section: "15.4.8",
  },
  "308": {
    meaning: "details.status_details.308.meaning",
    next: "details.status_details.308.next",
    section: "15.4.9",
  },
  "400": {
    meaning: "details.status_details.400.meaning",
    next: "details.status_details.400.next",
    section: "15.5.1",
  },
  "401": {
    meaning: "details.status_details.401.meaning",
    next: "details.status_details.401.next",
    section: "15.5.2",
  },
  "403": {
    meaning: "details.status_details.403.meaning",
    next: "details.status_details.403.next",
    section: "15.5.4",
  },
  "404": {
    meaning: "details.status_details.404.meaning",
    next: "details.status_details.404.next",
    section: "15.5.5",
  },
  "405": {
    meaning: "details.status_details.405.meaning",
    next: "details.status_details.405.next",
    section: "15.5.6",
  },
  "408": {
    meaning: "details.status_details.408.meaning",
    next: "details.status_details.408.next",
    section: "15.5.9",
  },
  "409": {
    meaning: "details.status_details.409.meaning",
    next: "details.status_details.409.next",
    section: "15.5.10",
  },
  "410": {
    meaning: "details.status_details.410.meaning",
    next: "details.status_details.410.next",
    section: "15.5.11",
  },
  "413": {
    meaning: "details.status_details.413.meaning",
    next: "details.status_details.413.next",
    section: "15.5.14",
  },
  "415": {
    meaning: "details.status_details.415.meaning",
    next: "details.status_details.415.next",
    section: "15.5.16",
  },
  "418": {
    meaning: "details.status_details.418.meaning",
    next: "details.status_details.418.next",
    section: "15.5.19",
  },
  "422": {
    meaning: "details.status_details.422.meaning",
    next: "details.status_details.422.next",
    section: "15.5.21",
  },
  "429": {
    meaning: "details.status_details.429.meaning",
    next: "details.status_details.429.next",
    section: "6585-4",
  },
  "500": {
    meaning: "details.status_details.500.meaning",
    next: "details.status_details.500.next",
    section: "15.6.1",
  },
  "501": {
    meaning: "details.status_details.501.meaning",
    next: "details.status_details.501.next",
    section: "15.6.2",
  },
  "502": {
    meaning: "details.status_details.502.meaning",
    next: "details.status_details.502.next",
    section: "15.6.3",
  },
  "503": {
    meaning: "details.status_details.503.meaning",
    next: "details.status_details.503.next",
    section: "15.6.4",
  },
  "504": {
    meaning: "details.status_details.504.meaning",
    next: "details.status_details.504.next",
    section: "15.6.5",
  },
};

function StatusDetails({ result }: { result: ToolResult }) {
  const toolText = useToolTranslations("Tool.runtime");
  const rows = "tablePreview" in result ? result.tablePreview?.rows : undefined;
  if (!rows?.length) return <ResultView result={result} />;
  const single = rows.length === 1;

  return (
    <ScrollRegion accessibleName={toolText("status.region")} className="min-h-0 flex-1">
      <div className="@container">
        {!single ? (
          <Muted className="border-b border-border px-5 py-3">
            {toolText("status.matches", { count: rows.length })}
          </Muted>
        ) : null}
        <div className="divide-y divide-border">
          {rows.map(([code, phrase]) => {
            const category = CATEGORIES[code.charAt(0) as keyof typeof CATEGORIES];
            const detail = STATUS_DETAILS[code];
            return (
              <article
                aria-label={`${code} ${phrase}`}
                className={single ? "space-y-6 p-6" : "space-y-3 p-5"}
                key={code}
              >
                <Stack direction="row" align="start" justify="between" gap="md">
                  <Stack direction="row" align="center" gap="md" wrap>
                    {single ? (
                      <Display className="tabular-nums">{code}</Display>
                    ) : (
                      <H2 className="tabular-nums">{code}</H2>
                    )}
                    <div className="space-y-2">
                      {single ? <H2>{phrase}</H2> : <H3>{phrase}</H3>}
                      {category ? (
                        <StatusBadge variant={category.variant}>{toolText(category.label)}</StatusBadge>
                      ) : null}
                    </div>
                  </Stack>
                  {!single ? (
                    <CopyButton content={`${code} ${phrase}`} iconOnly label={toolText("status.copy", { code })} />
                  ) : null}
                </Stack>
                {detail ? (
                  <>
                    <div className="max-w-3xl space-y-2">
                      {single ? <H3>{toolText("workspace.what_it_means_eed88f")}</H3> : null}
                      <P>{toolText(detail.meaning)}</P>
                    </div>
                    {single ? (
                      <div className="max-w-3xl space-y-2 border-t border-border pt-5">
                        <H3>{toolText("workspace.what_to_check_5d4b90")}</H3>
                        <P>{toolText(detail.next)}</P>
                      </div>
                    ) : null}
                    {single ? (
                      <TextLink
                        href={
                          code === "429"
                            ? "https://www.rfc-editor.org/rfc/rfc6585.html#section-4"
                            : `https://www.rfc-editor.org/rfc/rfc9110.html#section-${detail.section}`
                        }
                        rel="noreferrer"
                        target="_blank"
                      >
                        {toolText("workspace.read_the_http_8b901a")}
                      </TextLink>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </ScrollRegion>
  );
}

export default function HttpStatusWorkspace(props: WorkspaceProps) {
  return <ToolWorkspace {...props} renderPreview={(result) => <StatusDetails result={result} />} />;
}
