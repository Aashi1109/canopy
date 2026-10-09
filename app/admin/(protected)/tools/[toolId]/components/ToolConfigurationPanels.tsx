"use client";

import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";

import {
  H3,
  Caption,
  P,
  Button,
  StatusBadge,
  InlineCode,
  Overline,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui/index.tsx";
import { Check, Copy, Power } from "lucide-react";
import { useActionState, useState, type ReactElement } from "react";
import { toggleToolAction } from "../../../../actions";
import { publishToolContentAction, type ToolContentActionState } from "../../actions";

const IDLE: ToolContentActionState = { status: "idle", message: "" };

export function ToolIdentifier({ toolId }: { toolId: string }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copied = copiedId === toolId;
  const label = copied ? "Tool ID copied" : "Copy tool ID";

  async function copy() {
    setCopiedId(null);
    try {
      await navigator.clipboard.writeText(toolId);
      setCopiedId(toolId);
      toast.success("Tool ID copied.");
    } catch {
      toast.error("Couldn't copy the tool ID. Select it and copy it manually, or try again.");
    }
  }

  return (
    <div className="min-w-0 text-left">
      <Overline className="block text-muted-foreground">Stable tool ID</Overline>
      <div className="flex min-w-0 items-center gap-1">
        <InlineCode className="min-w-0 break-all select-all text-foreground">{toolId}</InlineCode>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label={label} onClick={() => void copy()} size="icon-sm" type="button" variant="ghost">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export function ActivationPanel({
  enabled,
  hasDefinition,
  hasDraftContent,
  published,
  publishedAtLabel,
  publicHref,
  toolId,
}: {
  readonly enabled: boolean;
  readonly hasDefinition: boolean;
  readonly hasDraftContent: boolean;
  readonly published: boolean;
  readonly publishedAtLabel: string | null;
  readonly publicHref: string | null;
  readonly toolId: string;
}): ReactElement {
  const [, action, pending] = useActionState(async (previous: ToolContentActionState, data: FormData) => {
    const next = await publishToolContentAction(previous, data);
    if (next.status === "success") toast.success(next.message);
    if (next.status === "error") toast.error(next.message);
    return next;
  }, IDLE);
  const canEnable = hasDefinition && Boolean(publicHref);

  return (
    <section className="min-w-0">
      <H3 className="sr-only">Publishing</H3>
      <div className="space-y-4">
        <div className="grid gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <P className="text-sm font-medium">Public availability</P>
              <StatusBadge variant={enabled ? "success" : canEnable ? "neutral" : "warning"}>
                {enabled ? "Visible" : canEnable ? "Hidden" : "Not ready"}
              </StatusBadge>
            </div>
            {!enabled && !canEnable ? (
              <Caption className="block mt-1 text-muted-foreground">
                {!hasDefinition
                  ? "Deploy the tool definition before enabling it."
                  : "Set a public slug before enabling this tool."}
              </Caption>
            ) : null}
          </div>
          <form action={toggleToolAction}>
            <input name="toolId" type="hidden" value={toolId} />
            <input name="enabled" type="hidden" value={String(!enabled)} />
            <SubmitButton
              className="w-full"
              disabled={!canEnable && !enabled}
              type="submit"
              variant={enabled ? "secondary" : "default"}
            >
              <Power aria-hidden="true" />
              {enabled ? "Disable tool" : "Enable tool"}
            </SubmitButton>
          </form>
        </div>

        <div className="grid gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <P className="text-sm font-medium">Page content</P>
              <StatusBadge variant={published ? "success" : hasDraftContent ? "warning" : "neutral"}>
                {published ? "Published" : hasDraftContent ? "Draft" : "Default"}
              </StatusBadge>
            </div>
            <Caption className="block mt-1 text-muted-foreground">
              {published
                ? publishedAtLabel
                  ? `Published ${publishedAtLabel}.`
                  : "Saved content is live."
                : hasDraftContent
                  ? "Saved changes are ready to publish."
                  : "Save changes to create a draft."}
            </Caption>
            {published ? (
              <Caption className="mt-1 block text-muted-foreground">
                Returning to draft restores default content.
              </Caption>
            ) : null}
          </div>
          <form action={action}>
            <input name="toolId" type="hidden" value={toolId} />
            <Button
              className="w-full"
              disabled={!published && !hasDraftContent}
              loading={pending}
              name="published"
              type="submit"
              value={published ? "false" : "true"}
              variant={published || !hasDraftContent ? "secondary" : "default"}
            >
              {published ? "Return to draft" : "Publish saved content"}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
