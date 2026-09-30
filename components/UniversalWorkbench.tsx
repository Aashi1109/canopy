"use client";

import { ToolPageLayout } from "@/components/tool-workbench/ToolPageLayout";
import {
  InlineCode,
  Caption,
  Strong,
  List,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  IconTile,
  WorkbenchShell,
} from "@/components/ui/index.tsx";
import { AlertCircle, CheckCircle2, Undo2, Wrench } from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useState, useSyncExternalStore } from "react";

import { ToolRuntimeProvider, useToolRuntime } from "@/lib/tool-runtime/useToolRuntime";
import type { ToolContent, ToolWorkbenchMark } from "@/lib/tool-framework/spec";
import type {
  ToolLifecycle,
  ToolDefinition,
  ToolPageComponentProps,
  ToolRuntimeSpec,
  ToolSettings,
} from "@/lib/tool-runtime/types";

type UniversalWorkbenchProps<Input, Settings extends ToolSettings, Result> = Omit<
  ToolPageComponentProps,
  "definitionKey"
> & {
  content: ToolContent;
  definition: ToolDefinition;
  runtimeSpec: ToolRuntimeSpec<Input, Settings, Result>;
  StatusMeta?: ComponentType;
  statusMeta?: ReactNode;
  validationReason?: string | null;
  Toolbar: ComponentType;
  workbenchIcon?: ReactNode;
  workbenchMark?: ToolWorkbenchMark;
  Workspace: ComponentType;
};

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Reactive `navigator.onLine`. Assumes online during SSR so the network dialog
// never flashes before hydration.
function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// Shown for tools flagged `capabilities.network` while the browser is offline:
// they call a live service and cannot run without a connection.
function OfflineNoticeDialog({ toolName }: { toolName: string }) {
  const isOnline = useIsOnline();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);

  return (
    <AlertDialog
      open={!isOnline && !dismissed}
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <AlertDialogContent className="max-w-md" data-testid="tool-offline-overlay">
        <AlertDialogHeader>
          <AlertDialogTitle>Internet connection required</AlertDialogTitle>
          <AlertDialogDescription>
            {toolName} uses a live online service, so it can&apos;t run offline. Reconnect and try again — the rest of
            your tools keep working without a connection.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setDismissed(true)}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmationDialog({
  changes,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
}: {
  changes: readonly string[];
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-w-md border-amber-500/40"
        data-testid="tool-confirmation-overlay"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onCancel();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {changes.length > 0 ? (
          <List className="max-h-32 space-y-1 overflow-auto rounded-md bg-muted p-3">
            {changes.map((change) => (
              <li key={change}>
                <InlineCode>{change}</InlineCode>
              </li>
            ))}
          </List>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WorkbenchFrame<Input, Settings extends ToolSettings, Result>({
  account,
  category,
  content,
  definition,
  description,
  relatedTools = [],
  StatusMeta,
  statusMeta,
  validationReason,
  title,
  Toolbar,
  workbenchIcon,
  workbenchMark,
  Workspace,
}: Omit<UniversalWorkbenchProps<Input, Settings, Result>, "runtimeSpec">) {
  const runtime = useToolRuntime<Input, Settings, Result>();
  const workbenchMarkText = workbenchMark?.text.trim();
  const isBusy = runtime.lifecycle === "running";
  const factSummary = runtime.facts.map((fact) => `${fact.label}: ${fact.value}`).join(" · ");
  const status =
    runtime.lifecycle === "running"
      ? definition.labels.running
      : runtime.lifecycle === "completed"
        ? runtime.notice || [definition.labels.ready.replace(/[.!?]+$/, ""), factSummary].filter(Boolean).join(" · ")
        : runtime.notice ||
          runtime.error ||
          runtime.issues[0]?.message ||
          validationReason ||
          lifecycleLabel(definition, runtime.lifecycle);
  const isMedia = definition.app === "media";
  const usesNetwork = Boolean(definition.capabilities.network);

  return (
    <>
      {usesNetwork ? <OfflineNoticeDialog toolName={title} /> : null}
      <ToolPageLayout
        account={account}
        app={definition.app}
        category={category}
        content={content}
        description={description}
        relatedTools={relatedTools}
        title={title}
        usesNetwork={usesNetwork}
        primaryAction={definition.labels.primaryAction}
      >
        <WorkbenchShell
          layoutStorageKey={`canopy:workbench-layout:${definition.definitionKey}`}
          workspaceTitle={title}
          aria-busy={isBusy || undefined}
          className="max-[56rem]:[&_[data-slot=workbench-toolbar-actions]]:w-full max-[56rem]:[&_[data-slot=workbench-toolbar-actions]]:min-w-0 max-[56rem]:[&_[data-slot=workbench-toolbar-actions]]:shrink"
          data-definition-key={definition.definitionKey}
          data-testid="tool-workspace"
          id="tool-workspace"
          status={
            <footer
              aria-live="polite"
              className="flex w-full min-w-0 items-center justify-between gap-4 text-muted-foreground"
              data-testid="tool-status-line"
              role="status"
            >
              <Caption
                className={`inline-flex min-w-0 items-center gap-2 ${
                  runtime.lifecycle === "completed" ? "text-success" : ""
                }`}
              >
                <Strong className="contents">
                  {runtime.lifecycle === "completed" ? (
                    <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
                  ) : runtime.lifecycle === "invalid" || runtime.lifecycle === "failed" ? (
                    <AlertCircle aria-hidden="true" className="size-4 text-destructive" />
                  ) : null}
                  <span className="truncate">{status}</span>
                  {runtime.canUndo && !runtime.pendingConfirmation ? (
                    <Button
                      className="relative h-7 px-2 after:absolute after:-inset-x-1 after:-inset-y-2"
                      onClick={runtime.undo}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Undo2 aria-hidden="true" className="size-3.5" />
                      Undo
                    </Button>
                  ) : null}
                </Strong>
              </Caption>
            </footer>
          }
          statusMeta={statusMeta ?? (runtime.lifecycle === "completed" && StatusMeta ? <StatusMeta /> : undefined)}
          tabIndex={-1}
          toolbar={
            <IconTile
              aria-hidden="true"
              className="size-[34px] bg-transparent text-foreground"
              tone={workbenchMarkText ? workbenchMark?.tone : undefined}
            >
              {workbenchIcon ??
                (workbenchMarkText ? (
                  <Caption>
                    <Strong>{workbenchMarkText}</Strong>
                  </Caption>
                ) : (
                  <Wrench />
                ))}
            </IconTile>
          }
          toolbarActions={
            <div
              aria-label={`${title} actions`}
              className="flex min-w-0 items-center gap-2 [&_button]:min-w-0 [&_button[data-size=default]]:!h-11 [&_button[data-size=default]]:!gap-2 [&_button[data-size=default]]:!px-4 [&_button[data-size=default]_svg]:!size-[18px] [&_button[data-variant=default]:enabled]:!bg-primary [&_button[data-variant=default]:enabled]:!text-primary-foreground [&_button[data-variant=default]:enabled:hover]:!bg-primary/90 max-[56rem]:w-full max-[56rem]:flex-wrap max-[56rem]:justify-end max-[24rem]:[&_button]:max-w-full max-[24rem]:[&_button]:overflow-hidden max-[24rem]:[&_button_svg]:hidden"
              data-testid="tool-action-toolbar"
              role="toolbar"
            >
              <Toolbar />
            </div>
          }
          variant={isMedia ? "media" : "utility"}
        >
          <section
            aria-label={`${title} workspace`}
            className="relative h-full min-h-0 min-w-0 overflow-hidden"
            data-testid="tool-workspace-content"
          >
            <Workspace />
          </section>
        </WorkbenchShell>

        {runtime.pendingConfirmation ? (
          <ConfirmationDialog
            changes={runtime.lastChanges}
            confirmLabel={runtime.pendingConfirmation.confirmLabel}
            description={runtime.pendingConfirmation.description}
            onCancel={runtime.cancelPendingCommand}
            onConfirm={runtime.confirmPendingCommand}
            title={runtime.pendingConfirmation.title}
          />
        ) : null}
      </ToolPageLayout>
    </>
  );
}

function lifecycleLabel(definition: ToolDefinition, lifecycle: ToolLifecycle) {
  switch (lifecycle) {
    case "empty":
      return "Ready for input.";
    case "running":
      return definition.labels.running;
    case "ready":
      return `Ready to ${(definition.labels.primaryAction ?? "run the tool").replace(/^./, (character) => character.toLowerCase())}.`;
    case "completed":
      return definition.labels.ready;
    case "invalid":
      return "Input needs attention.";
    case "failed":
      return "Action failed.";
  }
}

export function UniversalWorkbench<Input, Settings extends ToolSettings, Result>({
  runtimeSpec,
  ...props
}: UniversalWorkbenchProps<Input, Settings, Result>) {
  return (
    <ToolRuntimeProvider analyticsToolKey={props.definition.definitionKey} spec={runtimeSpec}>
      <WorkbenchFrame {...props} />
    </ToolRuntimeProvider>
  );
}
