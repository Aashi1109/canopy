"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Checkbox,
  FieldDescription,
  FieldError,
  FieldLabel,
  H3,
  Muted,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  selectTriggerVariants,
} from "@/components/ui/index.tsx";
import { normalizeDomain } from "@/lib/devtools/shared/url";
import type { ToolResult } from "@/lib/tool-framework/result";
import { DNS_RECORD_TYPES } from "./definition";

const RECORD_DESCRIPTIONS = {
  A: "IPv4 address",
  AAAA: "IPv6 address",
  MX: "Mail server",
  TXT: "Text and email verification",
  NS: "Nameserver",
  CNAME: "Domain alias",
} as const;

function DnsResultPreview({ result, domain }: { result: ToolResult; domain: string }) {
  const records = "tablePreview" in result ? result.tablePreview : undefined;
  const lookupStatus = result.sections?.find((section) => section.title === "Lookup status")?.body;
  const statuses = lookupStatus?.render === "table" ? lookupStatus.rows : [];
  const showTtl = records?.columns.includes("TTL (seconds)");
  const types = [...new Set([...statuses.map(([type]) => type), ...(records?.rows.map(([type]) => type) ?? [])])];
  const rows = types.flatMap((type) => {
    const answers: { type: string; name?: string; value?: string; ttl?: string; status?: string; detail?: string }[] = (
      records?.rows ?? []
    )
      .filter(([recordType]) => recordType === type)
      .map(([, name, value, ttl]) => ({ type, name, value, ttl }));
    const lookup = statuses.find(([queriedType]) => queriedType === type);
    if (lookup) {
      const [, status, detail] = lookup;
      if (status !== "Records returned") {
        answers.push({ type, status: status === "No records" ? `No ${type} records found` : status, detail });
      } else if (!answers.length && !records?.truncated) {
        answers.push({ type, status: "Other record type returned", detail });
      }
    }
    return answers;
  });

  return (
    <ScrollRegion
      accessibleName="DNS result records"
      className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overflow-x-auto! [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=table-container]]:overflow-visible"
    >
      <div className="space-y-2 p-4">
        <H3>{result.verdict?.label ?? "DNS lookup complete"}</H3>
        {result.verdict?.detail ? <Muted>{result.verdict.detail}</Muted> : null}
      </div>
      {rows.length ? (
        <Table className="w-full min-w-[36rem] table-fixed" aria-label="DNS records" tabIndex={0}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Type</TableHead>
              <TableHead className="w-36">Explanation</TableHead>
              <TableHead>Record value</TableHead>
              {showTtl ? <TableHead className="w-24">Cache time</TableHead> : null}
              <TableHead className="w-24">
                <span className="sr-only">Copy value</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ type, name, value, ttl, status, detail }, index) => (
              <TableRow key={index}>
                <TableCell className="align-top">{type}</TableCell>
                <TableCell className="align-top whitespace-normal">
                  {RECORD_DESCRIPTIONS[type as keyof typeof RECORD_DESCRIPTIONS] ?? "DNS record"}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  {status ? (
                    <>
                      <span>{status}</span>
                      {status !== `No ${type} records found` ? <Muted className="mt-1">{detail}</Muted> : null}
                    </>
                  ) : value === "" || (type === "TXT" && value === '""') ? (
                    <Muted>Empty value</Muted>
                  ) : (
                    <span className="whitespace-pre-wrap break-all">{value}</span>
                  )}
                  {name && name.toLowerCase().replace(/\.$/, "") !== domain ? (
                    <Muted className="mt-1 break-all">For {name}</Muted>
                  ) : null}
                  {type === "MX" && value !== undefined ? (
                    <Muted className="mt-1">
                      {/^0\s+\.$/.test(value.trim())
                        ? "This domain declares that it does not accept email."
                        : "The first number is priority; lower numbers are preferred."}
                    </Muted>
                  ) : null}
                </TableCell>
                {showTtl ? (
                  <TableCell className="align-top whitespace-normal">
                    {value === undefined ? "—" : ttl === "—" ? "Not supplied" : `${ttl} s`}
                  </TableCell>
                ) : null}
                <TableCell className="align-top">
                  {value !== undefined ? (
                    <CopyButton content={value} iconOnly label={`Copy ${type} record value`} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <div className="space-y-2 p-4">
        {records?.truncated ? (
          <Muted>Showing part of the records. Download the complete output for all answers.</Muted>
        ) : null}
        {statuses.some(([, status]) => status === "No records") ? (
          <Muted>A missing record type does not by itself indicate a problem with the domain.</Muted>
        ) : null}
        {showTtl && records?.rows.length ? (
          <Muted>TTL is the resolver’s remaining cache time in seconds, not the age of the record.</Muted>
        ) : null}
      </div>
    </ScrollRegion>
  );
}

export default function DnsCheckerWorkspace(props: WorkspaceProps) {
  const id = useId();
  const [submitted, setSubmitted] = useState(false);
  const disabled = Boolean(props.disabled || props.running || props.primaryAction?.running);
  const types = (typeof props.settings.types === "string" ? props.settings.types : DNS_RECORD_TYPES.join(","))
    .split(",")
    .map((type) => type.trim().toUpperCase())
    .filter(Boolean);
  const selected = DNS_RECORD_TYPES.filter((type) => types.includes(type));
  const typesError = !types.length
    ? "Select at least one record type."
    : types.some((type) => !DNS_RECORD_TYPES.some((allowed) => allowed === type))
      ? "Choose record types from the list."
      : null;
  let domainError: string | null = null;
  let domain = "";
  try {
    domain = normalizeDomain(props.input.text).toLowerCase().replace(/\.$/, "");
  } catch (error) {
    domainError = error instanceof Error ? error.message : "Enter a valid domain name.";
  }
  const validationReason = domainError ?? typesError;
  const visibleDomainError = submitted || props.input.text.trim() ? domainError : null;

  useEffect(() => {
    props.onValidationChange?.(validationReason);
    return () => props.onValidationChange?.(null);
  }, [props.onValidationChange, validationReason]);

  return (
    <ToolWorkspace
      {...props}
      renderPreview={(result) => <DnsResultPreview result={result} domain={domain} />}
      renderResult={(result) => (
        <ResultView
          language={props.settings.recordView === "raw" ? "json" : undefined}
          result={result.render === "text" ? { render: "text", text: result.text } : result}
        />
      )}
      inputFieldErrors={visibleDomainError ? { text: visibleDomainError } : undefined}
      onInputSubmit={() => {
        setSubmitted(true);
        if (disabled || validationReason || !props.primaryAction || props.primaryAction.disabled) return;
        props.primaryAction.onRun();
      }}
      renderInputSettings={() => (
        <div className="grid shrink-0 gap-1.5">
          <FieldLabel htmlFor={id}>Record types</FieldLabel>
          <Popover.Root>
            <Popover.Trigger
              aria-describedby={`${id}-selection ${id}-help`}
              aria-invalid={Boolean(typesError)}
              aria-label="Record types"
              className={selectTriggerVariants()}
              disabled={disabled}
              id={id}
            >
              <span data-slot="select-value" id={`${id}-selection`}>
                {selected.length === DNS_RECORD_TYPES.length
                  ? "All record types"
                  : selected.length
                    ? selected.join(", ")
                    : "Select record types"}
              </span>
              <ChevronDown aria-hidden="true" className="size-[15px] shrink-0" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                aria-label="Choose record types"
                className="z-50 grid w-72 max-w-[calc(100vw-32px)] gap-2 rounded-lg border border-input bg-popover p-3 text-popover-foreground shadow-md"
                sideOffset={4}
              >
                {DNS_RECORD_TYPES.map((type) => (
                  <Checkbox
                    aria-describedby={`${id}-${type}-help`}
                    aria-label={type}
                    checked={selected.includes(type)}
                    description={<span id={`${id}-${type}-help`}>{RECORD_DESCRIPTIONS[type]}</span>}
                    disabled={disabled}
                    key={type}
                    label={type}
                    onCheckedChange={(checked) =>
                      props.onSettingChange(
                        "types",
                        DNS_RECORD_TYPES.filter((candidate) =>
                          candidate === type ? checked === true : selected.includes(candidate),
                        ).join(","),
                      )
                    }
                  />
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {typesError ? (
            <FieldError id={`${id}-help`}>{typesError}</FieldError>
          ) : (
            <FieldDescription id={`${id}-help`}>
              Choose one or more types. Press Enter in Domain name to check.
            </FieldDescription>
          )}
        </div>
      )}
    />
  );
}
