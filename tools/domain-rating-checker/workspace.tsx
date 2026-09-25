"use client";

import { Globe, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { ResultSurface } from "@/components/ResultSurface";
import { ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import {
  Button,
  FieldError,
  FieldLabel,
  H3,
  H4,
  Input,
  Metric,
  Muted,
  P,
  Strong,
  TextLink,
} from "@/components/ui/index.tsx";
import { safeLink } from "@/lib/content/links";
import type { ToolResult } from "@/lib/tool-framework/result";
import { readDomainRating } from "./result";

function RatingAttribution({ license }: { license?: string }) {
  let licenseHref: string | undefined;
  try {
    const href = safeLink(license);
    if (/^https?:\/\//i.test(href)) licenseHref = href;
  } catch {
    // Preserve non-URL licence text in Raw without creating an unsafe link.
  }

  return (
    <Muted className="flex flex-wrap gap-x-4 gap-y-1">
      <TextLink href="https://ahrefs.com/" target="_blank" rel="noopener noreferrer">
        Domain Rating by Ahrefs
      </TextLink>
      {licenseHref ? (
        <TextLink href={licenseHref} target="_blank" rel="noopener noreferrer">
          License
        </TextLink>
      ) : null}
    </Muted>
  );
}

function RatingRaw({ result }: { result: ToolResult }) {
  const rating = readDomainRating(result);
  return (
    <Stack className="h-full">
      <div className="flex min-h-0 flex-1 flex-col">
        <ResultView result={result} />
      </div>
      <div className="shrink-0 border-t border-border p-4">
        <RatingAttribution license={rating?.license} />
      </div>
    </Stack>
  );
}

function RatingSummary({ result }: { result: ToolResult }) {
  const rating = readDomainRating(result);
  if (!rating) return <RatingRaw result={result} />;

  return (
    <ScrollRegion accessibleName="Domain rating summary" className="min-h-0 flex-1">
      <div className="space-y-5 p-4">
        <H3 className="break-all">{rating.target}</H3>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <Metric className="text-primary">{rating.score}</Metric>
              <Muted>out of 100</Muted>
            </div>
            <RatingAttribution license={rating.license} />
          </div>
          <div className="min-w-0 max-w-prose flex-1 basis-64 space-y-2">
            <H4>Backlink strength</H4>
            <P>
              Ahrefs measures the strength of links from other websites to this domain. Higher scores mean a stronger
              backlink profile.
            </P>
            <Muted>
              The scale is logarithmic: gaining points gets harder as the score rises. Compare similar websites; this
              score does not measure traffic or guarantee search rankings.
            </Muted>
          </div>
        </div>
        {rating.warning ? (
          <div className="space-y-1 border-t border-border pt-4">
            <P>
              <Strong>Note from Ahrefs</Strong>
            </P>
            <P className="whitespace-pre-wrap [overflow-wrap:anywhere]">{rating.warning}</P>
          </div>
        ) : null}
      </div>
    </ScrollRegion>
  );
}

export default function DomainRatingWorkspace(props: WorkspaceProps) {
  const inputId = useId();
  const [touched, setTouched] = useState(false);
  const running = Boolean(props.running || props.primaryAction?.running);
  const empty = !props.input.text.trim();
  const visibleError = touched && empty ? "Enter a domain or HTTP(S) URL." : null;

  useEffect(() => {
    props.onToolbarActionsChange?.({ primaryActionInWorkspace: true });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange]);

  return (
    <Stack className="h-full">
      <form
        className="shrink-0 space-y-2 border-b border-border p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (!empty && !props.disabled && !props.primaryAction?.disabled && !running) {
            props.primaryAction?.onRun();
          }
        }}
      >
        <FieldLabel htmlFor={inputId} required>
          Public domain
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
            maxLength={2048}
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
              Cancel
            </Button>
          ) : (
            <Button
              aria-busy={running || undefined}
              disabled={props.disabled || !props.primaryAction || props.primaryAction.disabled || running || empty}
              type="submit"
            >
              <Search aria-hidden="true" />
              {running ? "Checking domain…" : (props.primaryAction?.label ?? "Check domain rating")}
            </Button>
          )}
        </div>
        {visibleError ? <FieldError id={`${inputId}-error`}>{visibleError}</FieldError> : null}
      </form>
      <div className="min-h-0 flex-1 p-4">
        <ResultSurface
          error={props.error}
          renderPreview={(result) => <RatingSummary result={result} />}
          renderResult={(result) => <RatingRaw result={result} />}
          result={props.result}
          running={running}
          spec={props.spec}
          title="Domain rating"
          variant="card"
        />
      </div>
    </Stack>
  );
}
