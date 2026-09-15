import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react"

import { Badge } from "#components/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "#components/card"
import { Toaster } from "#components/sonner"
import { Tabs, TabsList, TabsTrigger } from "#components/tabs"
import { Caption } from "#components/typography"
import { cn } from "#lib/utils"

const LEGACY_TOOLBAR_BUTTON_SIZE_CLASSES = new Set([
  "[&_button]:!h-11",
  "[&_button]:!gap-2",
  "[&_button]:!px-4",
  "[&_button]:!text-[15px]",
  "[&_button_svg]:!size-[18px]",
])

function Tag({ className, ...props }: Omit<ComponentProps<typeof Badge>, "variant">) {
  return (
    <Badge
      data-slot="tag"
      className={cn("border-transparent bg-muted text-muted-foreground", className)}
      variant="secondary"
      {...props}
    />
  )
}

type SegmentedControlItem = {
  disabled?: boolean
  label: ReactNode
  value: string
}

function SegmentedControl({
  className,
  items,
  size = "inline",
  ...props
}: Omit<ComponentProps<typeof Tabs>, "children"> & {
  items: readonly SegmentedControlItem[]
  size?: "inline" | "navigation" | "field"
}) {
  return (
    <Tabs
      className={cn(size === "inline" && "-my-1.5 py-1.5", className)}
      data-size={size}
      data-slot="segmented-control"
      {...props}
    >
      <TabsList className={size === "inline" ? "h-8 p-0" : size === "field" ? "w-full min-w-0 items-stretch p-1" : undefined} variant="segmented">
        {items.map((item) => (
          <TabsTrigger
            className={
              size === "inline"
                ? "h-8 px-2.5 py-0 before:absolute before:inset-x-0 before:-inset-y-1.5"
                : size === "field"
                  ? "min-h-[37px] min-w-0 basis-0 whitespace-normal px-2! py-2.5! font-semibold leading-[17px]"
                  : undefined
            }
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function Toast(props: ComponentProps<typeof Toaster>) {
  return <Toaster data-slot="toast" {...props} />
}

type WorkbenchShellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  options?: ReactNode
  status?: ReactNode
  statusMeta?: ReactNode
  toolbar: ReactNode
  toolbarActions?: ReactNode
  variant?: "json" | "conversion" | "media" | "utility"
}

function WorkbenchShell({
  children,
  className,
  options,
  status,
  statusMeta,
  toolbar,
  toolbarActions,
  variant = "utility",
  ...props
}: WorkbenchShellProps) {
  const compactToolbarActions = isValidElement<{ className?: string }>(toolbarActions)
    ? cloneElement(toolbarActions, {
        className: toolbarActions.props.className
          ?.split(" ")
          .filter((token) => !LEGACY_TOOLBAR_BUTTON_SIZE_CLASSES.has(token))
          .join(" "),
      })
    : toolbarActions

  return (
    <section
      data-slot="workbench-shell"
      data-variant={variant}
      className={cn(
        "flex h-[calc(100dvh-4.5rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-input bg-card",
        "[&_[data-slot=button]:not([data-variant=card-action])]:h-8 [&_[data-slot=button]:not([data-variant=card-action])]:min-h-8 [&_[data-slot=button]:not([data-variant=card-action])]:gap-1.5 [&_[data-slot=button]:not([data-variant=card-action])]:rounded-lg [&_[data-slot=button]:not([data-variant=card-action])]:px-2.5 [&_[data-slot=button][data-size^=icon]]:size-8 [&_[data-slot=button][data-size^=icon]]:px-0 [&_[data-slot=button]_svg:not([class*=size-])]:size-3.5",
        "[&_[data-slot=input]]:h-8 [&_[data-slot=input]]:min-h-8 [&_[data-slot=input]:not([type=range]):not([data-leading-icon])]:pl-2.5 [&_[data-slot=input]:not([type=range]):not([data-suffix])]:pr-2.5",
        "[&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:min-h-8 [&_[data-slot=select-trigger]]:px-2.5 [&_[data-slot=select-trigger]>svg]:size-3.5",
        "[&_[data-slot=workbench-status]_[role=status]>span.text-success]:text-foreground",
        variant === "media" ? "shadow-sm" : variant === "conversion" ? "shadow-md" : "shadow-lg",
        className
      )}
      {...props}
    >
      <div
        data-slot="workbench-toolbar"
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2"
      >
        {toolbar}
        {toolbarActions ? (
          <div
            data-slot="workbench-toolbar-actions"
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            {compactToolbarActions}
          </div>
        ) : null}
      </div>
      {options ? (
        <div
          data-slot="workbench-options"
          className="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-muted px-5"
        >
          {options}
        </div>
      ) : null}
      <div data-slot="workbench-content" className="min-h-0 flex-1">
        {children}
      </div>
      {status || (statusMeta !== undefined && statusMeta !== null) ? (
        <div
          data-slot="workbench-status"
          className="flex h-[42px] shrink-0 items-center justify-between border-t border-border px-4"
        >
          {status}
          {statusMeta !== undefined && statusMeta !== null ? (
            <Caption className="ml-auto shrink-0 text-right text-muted-foreground max-[32rem]:hidden">
              {statusMeta}
            </Caption>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function JsonFormatterWorkbench(props: Omit<WorkbenchShellProps, "variant">) {
  return <WorkbenchShell data-slot="json-formatter-workbench" variant="json" {...props} />
}

function DataConversionWorkbench(props: Omit<WorkbenchShellProps, "variant">) {
  return <WorkbenchShell data-slot="data-conversion-workbench" variant="conversion" {...props} />
}

function UtilityWorkbench(props: Omit<WorkbenchShellProps, "variant">) {
  return <WorkbenchShell data-slot="utility-workbench" variant="utility" {...props} />
}

function ToolPageSystemControls({
  actions,
  children,
  className,
  description = "Shared inputs, preferences, status, and actions for this browser-local tool.",
  preferences,
  title = "Tool session controls",
  ...props
}: HTMLAttributes<HTMLElement> & {
  actions?: ReactNode
  description?: ReactNode
  preferences?: ReactNode
  title?: ReactNode
}) {
  return (
    <section
      data-slot="tool-page-system-controls"
      className={cn("flex w-full flex-col gap-4", className)}
      {...props}
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
      <div
        data-slot="tool-system-inputs"
        className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_280px_minmax(0,1fr)]"
      >
        {children}
      </div>
      {preferences ? (
        <div
          data-slot="tool-system-preferences"
          className="flex w-full flex-wrap items-center gap-x-5 gap-y-3"
        >
          {preferences}
        </div>
      ) : null}
      {actions ? (
        <div
          data-slot="tool-system-actions"
          className="flex w-full flex-wrap items-center justify-end gap-2.5"
        >
          {actions}
        </div>
      ) : null}
    </section>
  )
}

export {
  DataConversionWorkbench,
  JsonFormatterWorkbench,
  SegmentedControl,
  Tag,
  Toast,
  ToolPageSystemControls,
  UtilityWorkbench,
  WorkbenchShell,
}
export type { SegmentedControlItem, WorkbenchShellProps }
