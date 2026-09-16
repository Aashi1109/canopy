"use client";

import { SubmitButton } from "@/app/admin/(protected)/components/SubmitButton";

import { H3, Caption, Muted, P, TextLink, AlertBanner, Button, StatusBadge } from "@smarttools/ui";
import { ExternalLink, Power } from "lucide-react";
import { useActionState, type ReactElement } from "react";
import { toggleToolAction } from "../../../../actions";
import { publishToolContentAction, type ToolContentActionState } from "../../actions";

const IDLE: ToolContentActionState = { status: "idle", message: "" };

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
  const [state, action, pending] = useActionState(publishToolContentAction, IDLE);
  const canEnable = hasDefinition && Boolean(publicHref);

  return (
    <section className="grid gap-5">
      <div>
        <H3>Activation</H3>
        <Muted className="mt-1 text-muted-foreground">
          Publishing chooses the content source. Enabling controls public catalog visibility.
        </Muted>
      </div>

      {state.status !== "idle" ? (
        <AlertBanner variant={state.status === "success" ? "success" : "error"}>{state.message}</AlertBanner>
      ) : null}

      <div className="divide-y divide-border border-y border-border">
        <div className="flex flex-wrap items-center gap-3 py-4">
          <div className="min-w-0 flex-1">
            <P>Database content</P>
            <Caption className="block mt-1 text-muted-foreground">
              {published && publishedAtLabel
                ? `Published ${publishedAtLabel}`
                : hasDraftContent
                  ? "Code values remain live until the saved draft is published."
                  : "Using the tool’s default content. No saved draft."}
            </Caption>
          </div>
          <StatusBadge variant={published ? "success" : hasDraftContent ? "warning" : "neutral"}>
            {published ? "Published" : hasDraftContent ? "Draft" : "Default"}
          </StatusBadge>
          <form action={action}>
            <input name="toolId" type="hidden" value={toolId} />
            <Button
              disabled={!published && !hasDraftContent}
              loading={pending}
              name="published"
              size="sm"
              type="submit"
              value={published ? "false" : "true"}
              variant={published ? "secondary" : "default"}
            >
              {published ? "Return to draft" : "Publish saved content"}
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 py-4">
          <div className="min-w-0 flex-1">
            <P>Public availability</P>
            <Caption className="block mt-1 text-muted-foreground">
              {hasDefinition ? "The code definition is deployed." : "Deploy the tool definition before enabling it."}
            </Caption>
          </div>
          <StatusBadge variant={enabled ? "success" : hasDefinition ? "neutral" : "warning"}>
            {enabled ? "Visible" : hasDefinition ? "Hidden" : "Waiting for code"}
          </StatusBadge>
          <form action={toggleToolAction}>
            <input name="toolId" type="hidden" value={toolId} />
            <input name="enabled" type="hidden" value={String(!enabled)} />
            <SubmitButton
              disabled={!canEnable && !enabled}
              size="sm"
              type="submit"
              variant={enabled ? "secondary" : "default"}
            >
              <Power aria-hidden="true" />
              {enabled ? "Disable tool" : "Enable tool"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {enabled && publicHref ? (
        <TextLink
          className="inline-flex w-fit items-center gap-2 text-primary hover:underline"
          href={publicHref}
          rel="noreferrer"
          target="_blank"
        >
          Open public tool <ExternalLink aria-hidden="true" className="size-4" />
        </TextLink>
      ) : null}
    </section>
  );
}
