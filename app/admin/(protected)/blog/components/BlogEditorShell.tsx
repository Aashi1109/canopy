"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, History, PanelRight, X } from "lucide-react";
import { Button, Popover, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@smarttools/ui";

import styles from "./BlogEditor.module.css";

interface BlogEditorShellProps {
  title: string;
  children: ReactNode;
  toolbar: ReactNode;
  settings: ReactNode;
  history?: ReactNode;
  publicationActions?: ReactNode;
  status: string;
  saveState: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
  onSave: () => void;
  onPreview: () => void;
  onReview: () => void;
  canEdit?: boolean;
  canPublish?: boolean;
  backHref?: string;
  initialSettingsOpen?: boolean;
  busy?: boolean;
}

/** The parent owns editor content and persistence; this shell never starts saves itself. */
export function BlogEditorShell({
  title, children, toolbar, settings, history, publicationActions, status, saveState, onSave,
  onPreview, onReview, canEdit = false, canPublish = false, backHref = "/admin/blog", initialSettingsOpen = false, busy = false,
}: BlogEditorShellProps) {
  const [panel, setPanel] = useState<"settings" | "history" | null>(initialSettingsOpen ? "settings" : null);
  const settingsOpen = panel !== null;
  const historyButton = useRef<HTMLButtonElement>(null);
  const mobileHistoryButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const mobileSettingsButton = useRef<HTMLButtonElement>(null);
  const saving = saveState === "saving";
  const needsRecovery = saveState === "error" || saveState === "conflict";

  function closeSettings() {
    setPanel(null);
    const desktop = panel === "history" ? historyButton : settingsButton;
    const mobile = panel === "history" ? mobileHistoryButton : mobileSettingsButton;
    const button = desktop.current?.getClientRects().length ? desktop.current : mobile.current;
    button?.focus();
  }

  return (
    <TooltipProvider>
      <section className={styles.shell} data-settings-open={settingsOpen} aria-label="Post editor"
        onKeyDown={(event) => {
          if (event.key === "Escape" && settingsOpen) { event.preventDefault(); closeSettings(); }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (canEdit && !saving && !busy && saveState !== "conflict") onSave();
          }
        }}>
        <header className={styles.header}>
          <Button asChild variant="ghost" size="xs"><Link href={backHref}><ArrowLeft aria-hidden="true" />Posts</Link></Button>
          <h1 className={styles.title}>{title || "Untitled post"}</h1>
          <div className={styles.actions}>
            {history && <Button size="xs" ref={historyButton} variant={panel === "history" ? "secondary" : "ghost"} aria-expanded={panel === "history"} aria-controls="blog-post-settings" onClick={() => setPanel(panel === "history" ? null : "history")}><History aria-hidden="true" />History</Button>}
            {publicationActions && <Popover.Root><Popover.Trigger asChild><Button size="sm" variant="ghost">Post actions<ChevronDown aria-hidden="true" /></Button></Popover.Trigger><Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={16} className="z-50 flex max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-card p-2 shadow-lg [&>button]:justify-start [&>a]:justify-start">{publicationActions}</Popover.Content></Popover.Portal></Popover.Root>}
            <Button size="sm" ref={settingsButton} variant="outline" className={panel === "settings" ? "border-primary bg-accent" : undefined}
              aria-label="Post settings" aria-expanded={panel === "settings"} aria-controls="blog-post-settings" onClick={() => setPanel(panel === "settings" ? null : "settings")}>
              <PanelRight aria-hidden="true" /><span>Post settings</span>
            </Button>
            <Button size="sm" variant="outline" onClick={onPreview} disabled={busy || saveState === "conflict"}>Preview</Button>
            {canPublish && <Button size="sm" aria-label="Review & publish" onClick={onReview} disabled={busy || needsRecovery}><span className="sm:hidden">Review</span><span className="hidden sm:inline">Review & publish</span></Button>}
          </div>
          <nav className={styles.mobileTabs} aria-label="Editor stages">
            <Button size="sm" variant={!settingsOpen ? "default" : "outline"} aria-pressed={!settingsOpen} onClick={() => setPanel(null)}>Write</Button>
            <Button size="sm" ref={mobileSettingsButton} variant={panel === "settings" ? "default" : "outline"} aria-pressed={panel === "settings"} aria-controls="blog-post-settings" onClick={() => setPanel("settings")}>Settings</Button>
            {history && <Button size="sm" ref={mobileHistoryButton} variant={panel === "history" ? "default" : "outline"} aria-pressed={panel === "history"} aria-controls="blog-post-settings" onClick={() => setPanel("history")}>History</Button>}
            <Button size="sm" variant="outline" onClick={onPreview} disabled={busy || saveState === "conflict"}>Preview</Button>
          </nav>
        </header>
        <div className={styles.workspace}>
          <div className={styles.canvas}>
            <div className={styles.toolbar} aria-label="Formatting tools">{toolbar}</div>
            <div className={styles.scroll} data-blog-editor-scroll="true">
              <div className={styles.article}>{children}</div>
            </div>
          </div>
          <aside id="blog-post-settings" hidden={!settingsOpen}
            className={styles.settings}
            aria-label={panel === "history" ? "Revision history" : "Post settings"}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{panel === "history" ? "Revision history" : "Post settings"}</h2>
              <Tooltip><TooltipTrigger asChild><Button aria-label={panel === "history" ? "Close revision history" : "Close post settings"} size="icon-xs" variant="ghost" onClick={closeSettings}><X aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>Close panel (Escape)</TooltipContent></Tooltip>
            </div>
            {panel === "history" ? history : settings}
            <div className={styles.mobileSettingsActions}>
              {canPublish && <Button size="sm" onClick={onReview} disabled={busy || needsRecovery}>Review & publish</Button>}
              {publicationActions}
            </div>
          </aside>
        </div>
        <footer className={styles.footer}>
          <p role={needsRecovery ? "alert" : "status"} className={needsRecovery ? "text-destructive" : "text-muted-foreground"}>{status}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">{canEdit ? "Autosave on" : "Read only"}<span className="hidden sm:inline"> · Ctrl / Cmd + S to save</span></span>
            {canEdit && <Button size="xs" variant="ghost" loading={saving} disabled={busy || saveState === "conflict"} onClick={onSave}>
              {saveState === "error" ? "Retry save" : "Save draft"}
            </Button>}
          </div>
        </footer>
      </section>
    </TooltipProvider>
  );
}
