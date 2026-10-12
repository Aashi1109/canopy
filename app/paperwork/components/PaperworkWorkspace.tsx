"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";
import { Tabs, ToolPageHeader, WorkbenchShell } from "@/components/ui/index.tsx";
import { useWorkbenchPresentation } from "@/components/ui/components/workbench-presentation";

const ToolbarActionsContext = createContext<{ target: HTMLDivElement | null } | null>(null);

export function PaperworkWorkspace({
  children,
  title,
  actions,
  status,
}: {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  const t = useTranslations("Tool.runtime");
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  return (
    <ToolbarActionsContext.Provider value={{ target: toolbarTarget }}>
      <WorkbenchShell
        aria-label={t("shared.workspace.title", { title })}
        workspaceTitle={title}
        className="print:h-auto print:overflow-visible print:border-0 print:shadow-none"
        variant="utility"
        toolbarActions={
          <div ref={setToolbarTarget} className="flex flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        }
        status={status}
        toolbar={<FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />}
      >
        <div className="h-full min-h-0 overflow-auto overscroll-contain print:h-auto print:overflow-visible">
          {children}
        </div>
      </WorkbenchShell>
    </ToolbarActionsContext.Provider>
  );
}

export function PaperworkToolHeader({
  embedded = false,
  actions,
  ...props
}: ComponentProps<typeof ToolPageHeader> & { embedded?: boolean }) {
  if (embedded) {
    return <PaperworkToolbarActions>{actions}</PaperworkToolbarActions>;
  }
  return <ToolPageHeader actions={actions} {...props} />;
}

/** Keep tool-owned action state while rendering the controls in the shared toolbar. */
export function PaperworkToolbarActions({ children }: { children: ReactNode }) {
  const toolbar = useContext(ToolbarActionsContext);
  if (!toolbar) return <>{children}</>;
  return toolbar.target ? createPortal(children, toolbar.target) : null;
}

/** The expanded workbench owns view switching while it is open. */
export function PaperworkMobileTabs(props: ComponentProps<typeof Tabs>) {
  const presentation = useWorkbenchPresentation();
  return presentation?.focused ? null : <Tabs {...props} />;
}
