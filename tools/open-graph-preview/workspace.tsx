"use client";

import { CircleAlert, CircleCheck, Globe, ImageIcon, Search, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import codeStyles from "@/components/content/codeHighlight.module.css";
import { ResultActions } from "@/components/ResultView";
import { Stack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  Caption,
  FieldError,
  FieldLabel,
  Input,
  Muted,
  StatusBadge,
  Strong,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/index.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import { highlightCode } from "@/lib/markdown/codeHighlight";
import type { ToolLinkPreviewImage, ToolLinkPreviewRender } from "@/lib/tool-framework/result";
import { parseWebsiteUrl } from "./url";

const PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "discord", label: "Discord" },
] as const;

type Platform = (typeof PLATFORMS)[number]["value"];

function PreviewImage({ image, compact = false }: { image: ToolLinkPreviewImage | null; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const previewUrl = image?.previewUrl;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        compact ? "w-28 shrink-0 self-stretch max-sm:w-20" : "aspect-[1.91/1] min-h-0 w-full shrink",
      )}
    >
      {previewUrl && !failed ? (
        // The server supplies a bounded, validated raster data URL, never a page-controlled remote request.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={image.alt || "Social sharing image"}
          className="absolute inset-0 size-full object-contain"
          onError={() => setFailed(true)}
          src={previewUrl}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 p-3 text-center">
          <ImageIcon aria-hidden="true" className="size-6" />
          {!compact ? <Caption>{image ? "Image preview unavailable" : "No sharing image found"}</Caption> : null}
        </div>
      )}
    </div>
  );
}

function SocialCard({ platform, result }: { platform: Platform; result: ToolLinkPreviewRender }) {
  const { metadata } = result;
  const twitter = platform === "x";
  const title = (twitter && metadata.twitter.title) || metadata.title || "No title found";
  const description = (twitter && metadata.twitter.description) || metadata.description;
  const image = (twitter && metadata.twitter.image) || metadata.image;
  const host = new URL(result.resolvedUrl).hostname;
  const compact = platform === "whatsapp" || (twitter && metadata.twitter.card !== "summary_large_image");
  const siteName = metadata.siteName || host;
  const previewImage = <PreviewImage compact={compact} image={image} key={image?.previewUrl ?? "no-image"} />;

  return (
    <Card
      aria-label={`${PLATFORMS.find((item) => item.value === platform)?.label} link preview`}
      className={cn(
        "max-h-full w-full max-w-md gap-0 overflow-hidden p-0 shadow-none",
        compact && "flex-row",
        platform === "discord" && "gap-3 border-l-4 border-l-primary p-4",
        platform === "whatsapp" && "max-w-md bg-muted/40",
      )}
    >
      {platform === "discord" ? (
        <>
          <div className="shrink-0 space-y-2">
            <Caption className="block truncate text-muted-foreground">{siteName}</Caption>
            <CardTitle className="line-clamp-2 break-words text-primary">{title}</CardTitle>
            {description ? <CardDescription className="line-clamp-2 break-words">{description}</CardDescription> : null}
          </div>
          {previewImage}
        </>
      ) : (
        <>
          {previewImage}
          <div
            className={cn(
              "min-w-0 space-y-1 p-3",
              compact ? "flex-1" : "shrink-0",
              platform === "facebook" && "bg-muted/45",
            )}
          >
            {platform === "facebook" ? (
              <Caption className="block truncate text-muted-foreground uppercase">{host}</Caption>
            ) : null}
            <CardTitle className="line-clamp-2 break-words">{title}</CardTitle>
            {description && platform !== "linkedin" ? (
              <CardDescription className="line-clamp-2 break-words">{description}</CardDescription>
            ) : null}
            {platform !== "facebook" ? (
              <Caption className="block truncate text-muted-foreground">{host}</Caption>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function MetadataInspector({ result }: { result: ToolLinkPreviewRender }) {
  const severityOrder = { error: 0, warn: 1, ok: 2 };
  const checks = [...result.checks].sort((left, right) => severityOrder[left.level] - severityOrder[right.level]);

  return (
    <>
      <ul className="divide-y divide-border" aria-label="Metadata checks">
        {checks.map((check, index) => {
          const Icon = check.level === "ok" ? CircleCheck : check.level === "warn" ? TriangleAlert : CircleAlert;
          return (
            <li className="flex gap-3 p-4" key={`${check.property}-${index}`}>
              <Icon
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  check.level === "ok" ? "text-success" : check.level === "warn" ? "text-warning" : "text-destructive",
                )}
              />
              <div className="min-w-0 space-y-1">
                <div className="text-sm">
                  <span className="sr-only">
                    {check.level === "ok" ? "Passed" : check.level === "warn" ? "Warning" : "Error"}:{" "}
                  </span>
                  <Strong>{check.label}</Strong>
                </div>
                <Muted className="break-words">{check.detail}</Muted>
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-3 border-t border-border p-4">
        <div>
          <dt>
            <Caption className="text-muted-foreground">Scanned URL</Caption>
          </dt>
          <dd className="break-all text-sm">{result.resolvedUrl}</dd>
        </div>
        {result.requestedUrl !== result.resolvedUrl ? (
          <div>
            <dt>
              <Caption className="text-muted-foreground">Redirected from</Caption>
            </dt>
            <dd className="break-all text-sm">{result.requestedUrl}</dd>
          </div>
        ) : null}
        {result.metadata.image ? (
          <div>
            <dt>
              <Caption className="text-muted-foreground">Sharing image</Caption>
            </dt>
            <dd className="break-all text-sm">{result.metadata.image.url}</dd>
            {result.metadata.image.width && result.metadata.image.height ? (
              <dd>
                <Caption className="text-muted-foreground">
                  Declared size: {result.metadata.image.width} × {result.metadata.image.height}
                </Caption>
              </dd>
            ) : null}
          </div>
        ) : null}
      </dl>
    </>
  );
}

export default function OpenGraphWorkspace(props: WorkspaceProps) {
  const urlId = useId();
  const tagsId = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  const [urlTouched, setUrlTouched] = useState(false);
  const urlError = useMemo(() => {
    try {
      parseWebsiteUrl(props.input.text);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Enter a valid website URL or domain.";
    }
  }, [props.input.text]);
  const visibleUrlError = urlTouched ? urlError : null;
  const result = props.result?.render === "link-preview" ? props.result : null;
  const counts = { error: 0, warn: 0, ok: 0 };
  for (const check of result?.checks ?? []) counts[check.level] += 1;
  const running = Boolean(props.running || props.primaryAction?.running);
  const state = props.error ? "error" : running ? "loading" : result ? "ready" : "empty";
  const actionLabel = result ? "Rescan" : "Scan URL";
  const tags = result?.tags ?? "";
  const highlightedTags = useMemo(() => highlightCode(tags, "html"), [tags]);

  useEffect(() => {
    props.onToolbarActionsChange?.({ primaryActionInWorkspace: true, primaryActionLabel: actionLabel });
    return () => props.onToolbarActionsChange?.(null);
  }, [actionLabel, props.onToolbarActionsChange]);

  return (
    <Stack className="h-full">
      <form
        className="shrink-0 space-y-2 border-b border-border p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setUrlTouched(true);
          if (!urlError && !props.primaryAction?.disabled && !running) props.primaryAction?.onRun();
        }}
      >
        <FieldLabel htmlFor={urlId} required>
          Website URL
        </FieldLabel>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            aria-describedby={visibleUrlError ? `${urlId}-error` : undefined}
            aria-invalid={Boolean(visibleUrlError)}
            autoComplete="url"
            disabled={props.disabled || running}
            id={urlId}
            inputMode="url"
            leadingIcon={<Globe />}
            maxLength={2048}
            onBlur={() => setUrlTouched(true)}
            onChange={(event) => {
              setUrlTouched(true);
              props.onInputChange({ ...props.input, text: event.target.value });
            }}
            placeholder="https://example.com"
            ref={urlInput}
            required
            type="text"
            value={props.input.text}
          />
          {running ? (
            <Button
              disabled={!props.primaryAction?.onCancel}
              onClick={(event) => {
                // Cancelling turns this control back into the submit button.
                // Stop the same click from submitting the newly rendered form.
                event.preventDefault();
                props.primaryAction?.onCancel?.();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          ) : (
            <Button disabled={!props.primaryAction || props.primaryAction.disabled || Boolean(urlError)} type="submit">
              <Search aria-hidden="true" />
              {actionLabel}
            </Button>
          )}
        </div>
        {visibleUrlError ? <FieldError id={`${urlId}-error`}>{visibleUrlError}</FieldError> : null}
      </form>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)] overflow-hidden max-[64rem]:flex max-[64rem]:flex-col max-[64rem]:overflow-y-auto">
        <WorkspaceSurface
          className="h-full border-r border-border max-[64rem]:h-auto max-[64rem]:min-h-96 max-[64rem]:shrink-0 max-[64rem]:border-r-0 max-[64rem]:border-b"
          purpose="preview"
          state={state}
          stateAction={
            props.error ? (
              <Button onClick={() => urlInput.current?.focus()} variant="outline">
                Edit URL
              </Button>
            ) : undefined
          }
          stateDescription={
            props.error ??
            (running
              ? "Fetching the page and checking its social metadata…"
              : "Enter a public website URL above, then scan it to see how its links could appear.")
          }
          stateIcon={!running && !props.error ? <Globe aria-hidden="true" /> : undefined}
          stateTitle={props.error ? "Could not scan this page" : running ? "Scanning website" : "Preview a shared link"}
          title="Social previews"
        >
          {result ? (
            <Tabs className="min-h-0 min-w-0 flex-1 gap-0" defaultValue="facebook">
              <div className="shrink-0 overflow-x-auto border-b border-border px-3">
                <TabsList aria-label="Preview platform" className="border-0">
                  {PLATFORMS.map((platform) => (
                    <TabsTrigger key={platform.value} value={platform.value}>
                      {platform.label}
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="html">HTML tags</TabsTrigger>
                </TabsList>
              </div>
              {PLATFORMS.map((platform) => (
                <TabsContent
                  className="min-h-0 p-4 data-[state=active]:flex data-[state=active]:flex-col max-[64rem]:min-h-80"
                  key={platform.value}
                  value={platform.value}
                >
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <SocialCard platform={platform.value} result={result} />
                  </div>
                  <Muted className="mx-auto mt-3 max-w-xl shrink-0 text-center">
                    Approximate {platform.label} preview. Actual appearance may vary with platform caching and layout.
                  </Muted>
                </TabsContent>
              ))}
              <TabsContent
                className="min-h-0 data-[state=active]:flex data-[state=active]:flex-col max-[64rem]:h-80"
                value="html"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <FieldLabel htmlFor={tagsId}>Fetched HTML tags</FieldLabel>
                  <div className="flex items-center gap-1">
                    <ResultActions canCopy canDownload result={result} />
                  </div>
                </div>
                <SourceTextarea
                  className="min-h-0 flex-1"
                  highlightedValue={
                    <span
                      className={`${codeStyles.highlight} [&_.hljs-name]:text-primary`}
                      dangerouslySetInnerHTML={{ __html: highlightedTags }}
                    />
                  }
                  id={tagsId}
                  onChange={() => undefined}
                  readOnly
                  value={tags}
                  wrap="off"
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </WorkspaceSurface>

        <WorkspaceSurface
          actions={
            result && state === "ready" ? (
              <>
                <StatusBadge variant={counts.error ? "danger" : "neutral"}>
                  {counts.error} {counts.error === 1 ? "error" : "errors"}
                </StatusBadge>
                <StatusBadge variant={counts.warn ? "warning" : "neutral"}>
                  {counts.warn} {counts.warn === 1 ? "warning" : "warnings"}
                </StatusBadge>
                <StatusBadge variant="success">{counts.ok} passed</StatusBadge>
              </>
            ) : undefined
          }
          className="h-full max-[64rem]:h-auto max-[64rem]:min-h-64 max-[64rem]:shrink-0 [&>[data-slot=workspace-header]]:flex-wrap [&>[data-slot=workspace-header]]:gap-y-2 [&>[data-slot=workspace-header]]:py-2"
          purpose="inspector"
          scroll="content"
          state={result && state === "ready" ? "ready" : "empty"}
          stateDescription="After a scan, check which metadata is present and what needs attention."
          stateTitle="Metadata checks"
          title="Metadata inspector"
        >
          {result ? <MetadataInspector result={result} /> : null}
        </WorkspaceSurface>
      </div>
    </Stack>
  );
}
