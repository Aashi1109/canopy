"use client";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, unlocalizedPathname, type Locale } from "@/lib/i18n/config";

import { ArrowRight, Bookmark, Braces, Files, LoaderCircle, X } from "lucide-react";
import { Dialog, Popover } from "radix-ui";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "./button.tsx";
import { ContentState } from "./ContentState.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip.tsx";
import { cn } from "../lib/utils.ts";
import { matchBreakpoint } from "../lib/breakpoints.ts";
import { SavedToolsStore, requestSavedTools, STORAGE_KEY, type SavedTool } from "../lib/saved-tools.ts";

const ACTIVE_SAVE_BUTTON_CLASS_NAME =
  "border-primary/25 bg-accent text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/15 hover:text-primary active:bg-primary/20 active:text-primary";

type SavedContextValue = {
  store: SavedToolsStore;
  state: ReturnType<SavedToolsStore["getSnapshot"]>;
  open: boolean;
  show: (element: HTMLElement) => void;
};
const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedToolsProvider({ children, publicSiteUrl }: { children: ReactNode; publicSiteUrl?: string }) {
  const t = useTranslations("Saved");
  const locale = useLocale() as Locale;
  const siteHref = (path: string, toolLocale: Locale = locale) =>
    publicSiteUrl ? new URL(localizeHref(path, toolLocale), publicSiteUrl).href : localizeHref(path, toolLocale);
  const store = useMemo(
    () =>
      new SavedToolsStore(
        {
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
        },
        (operation) => requestSavedTools(operation, locale),
      ),
    [locale],
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [currentHref, setCurrentHref] = useState("");
  const [removed, setRemoved] = useState<SavedTool | null>(null);
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const virtualAnchor = useRef({
    getBoundingClientRect: () =>
      trigger.current?.isConnected ? trigger.current.getBoundingClientRect() : (anchorRect.current ?? new DOMRect()),
  });
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void store.refresh();
    const media = matchBreakpoint({ max: "compact" });
    const adapt = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    adapt();
    const refresh = () => {
      setRemoved(null);
      setNotice("");
      void store.refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) refresh();
    };
    media.addEventListener("change", adapt);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", adapt);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
      store.invalidate();
    };
  }, [store]);

  function show(element: HTMLElement) {
    if (open) {
      setOpen(false);
      return;
    }
    trigger.current = element;
    anchorRect.current = element.getBoundingClientRect();
    setCurrentHref(unlocalizedPathname(window.location.pathname));
    setRemoved(null);
    setNotice("");
    setOpen(true);
    void store.refresh();
  }
  function restoreFocus(event: Event) {
    event.preventDefault();
    const target = trigger.current?.isConnected
      ? trigger.current
      : document.querySelector<HTMLElement>("[data-mobile-menu-toggle]");
    target?.focus({ preventScroll: true });
  }
  const saved = state.ids.flatMap((id) => {
    const tool = state.tools.find((candidate) => candidate.toolId === id);
    return tool ? [tool] : [];
  });
  const currentTool = state.tools.find((tool) => unlocalizedPathname(tool.href) === currentHref);
  const body = (
    <TooltipProvider>
      <div className="flex h-11 items-center gap-2 px-2">
        <span className="text-base font-semibold">{t("title")}</span>
        {state.status === "ready" ? <span className="text-sm text-muted-foreground">{saved.length}</span> : null}
        <Button
          ref={closeButton}
          aria-label={t("close")}
          className="ms-auto text-muted-foreground"
          onClick={() => setOpen(false)}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {state.error ? (
        state.status === "error" ? (
          <ContentState
            density="compact"
            state="error"
            headingLevel="h3"
            title={t("loadFailed")}
            description={t("syncError")}
            announcement="polite"
            action={
              <Button onClick={() => void store.refresh()} size="sm" variant="outline">
                {t("retry")}
              </Button>
            }
          />
        ) : (
          <div role="alert" className="mx-2 my-2 rounded-lg bg-destructive/10 p-3 text-sm">
            <p>{t("changeError")}</p>
            <Button onClick={() => void store.refresh()} size="sm" variant="outline" className="mt-2">
              {t("retry")}
            </Button>
          </div>
        )
      ) : null}
      {state.status === "loading" ? (
        <p role="status" className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          {t("loading")}
        </p>
      ) : null}
      {state.status === "ready" ? (
        <>
          {currentTool && !state.ids.includes(currentTool.toolId) ? (
            <div className="mx-2 my-2 border-b border-border pb-3">
              <SaveToolButton href={currentTool.href} />
            </div>
          ) : null}
          {saved.length ? (
            <div className="max-h-[min(384px,45dvh)] overflow-y-auto overscroll-contain" aria-label={t("listLabel")}>
              {saved.map((tool) => {
                const Icon = tool.href.startsWith("/devtools/") ? Braces : Files;
                return (
                  <div key={tool.toolId} className="flex min-h-16 items-center gap-1 rounded-lg px-1">
                    <a
                      href={siteHref(tool.href, tool.locale)}
                      onClick={() => setOpen(false)}
                      className="group/saved-tool flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 no-underline outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary"
                      >
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-semibold">{tool.name}</span>
                        <span className="block text-xs text-muted-foreground group-hover/saved-tool:text-accent-foreground">
                          {tool.category}
                        </span>
                      </span>
                    </a>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("removeLabel", { name: tool.name })}
                          aria-pressed
                          disabled={state.pending}
                          size="icon"
                          variant="ghost"
                          className={ACTIVE_SAVE_BUTTON_CLASS_NAME}
                          onClick={async () => {
                            if (await store.change(tool.toolId, false)) {
                              setRemoved(tool);
                              setNotice(t("removed", { name: tool.name }));
                              closeButton.current?.focus();
                            }
                          }}
                        >
                          <Bookmark aria-hidden="true" className="size-[18px] fill-current" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("remove")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button asChild size="icon" variant="ghost" className="text-primary">
                          <a
                            aria-label={t("open", { name: tool.name })}
                            href={siteHref(tool.href, tool.locale)}
                            onClick={() => setOpen(false)}
                          >
                            <ArrowRight aria-hidden="true" className="size-[18px]" />
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("open", { name: tool.name })}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          ) : (
            <ContentState
              density="compact"
              headingLevel="h3"
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              action={
                <Button asChild variant="outline" size="sm">
                  <a href={siteHref("/")} onClick={() => setOpen(false)}>
                    {t("browse")}
                  </a>
                </Button>
              }
            />
          )}
          {removed ? (
            <div className="mx-2 my-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2 text-sm">
              <span>{t("removed", { name: removed.name })}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={state.pending}
                onClick={async () => {
                  if (await store.change(removed.toolId, true)) {
                    setNotice(t("restored", { name: removed.name }));
                    setRemoved(null);
                  }
                }}
              >
                {t("undo")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>
    </TooltipProvider>
  );
  return (
    <SavedContext.Provider value={{ store, state, open, show }}>
      {children}
      <Popover.Root open={open && !mobile} onOpenChange={setOpen}>
        <Popover.Anchor virtualRef={virtualAnchor} />
        <Popover.Portal>
          <Popover.Content
            aria-label={t("title")}
            align="end"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            onCloseAutoFocus={restoreFocus}
            className="z-[80] w-[400px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-card p-3 text-foreground shadow-lg outline-none"
          >
            {!mobile ? body : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Dialog.Root open={open && mobile} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/30" />
          <Dialog.Content
            onCloseAutoFocus={restoreFocus}
            className="fixed inset-x-0 bottom-0 z-[80] max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-3 pb-[max(16px,env(safe-area-inset-bottom))] text-foreground shadow-lg outline-none"
          >
            <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
            <Dialog.Description className="sr-only">{t("description")}</Dialog.Description>
            {mobile ? body : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </SavedContext.Provider>
  );
}

export function SavedToolsTrigger({
  className,
  menu = false,
  onActivate,
}: {
  className?: string;
  menu?: boolean;
  onActivate?: () => void;
}) {
  const t = useTranslations("Saved");
  const saved = useContext(SavedContext);
  return (
    <Button
      data-saved-trigger
      aria-haspopup="dialog"
      aria-expanded={saved?.open ?? false}
      className={cn(menu ? "w-full justify-start" : "rounded-full", className)}
      variant={menu ? "ghost" : "outline"}
      size={menu ? "default" : "sm"}
      onClick={(event) => {
        saved?.show(event.currentTarget);
        onActivate?.();
      }}
    >
      <Bookmark aria-hidden="true" className="size-4 text-muted-foreground" />
      {t(menu ? "title" : "short")}
    </Button>
  );
}

export function SaveToolButton({
  href,
  iconOnly = false,
  className,
}: {
  href?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations("Saved");
  const saved = useContext(SavedContext);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const tool = saved?.state.tools.find(
    (item) => unlocalizedPathname(item.href) === (href ? unlocalizedPathname(href) : href),
  );
  if (!saved || !tool) return null;
  const active = saved.state.ids.includes(tool.toolId);
  const label = t(active ? "removeLabel" : "saveLabel", { name: tool.name });
  const control = (
    <Button
      aria-label={label}
      aria-pressed={active}
      disabled={saved.state.pending || saved.state.status !== "ready"}
      size={iconOnly ? "icon" : "sm"}
      variant={iconOnly ? "ghost" : "outline"}
      className={cn(active && ACTIVE_SAVE_BUTTON_CLASS_NAME, className)}
      onClick={async () => {
        const success = await saved.store.change(tool.toolId, !active);
        setFailed(!success);
        setMessage(success ? t(active ? "removed" : "saved", { name: tool.name }) : t("saveFailed"));
      }}
    >
      <Bookmark aria-hidden="true" className={active ? "fill-current" : undefined} />
      {!iconOnly && t(active ? "short" : "save")}
    </Button>
  );
  return (
    <span className={cn("inline-flex flex-col", iconOnly ? "items-end" : "items-start")}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{control}</TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span role="status" className={failed ? "mt-1 max-w-48 text-xs text-destructive" : "sr-only"}>
        {message}
      </span>
    </span>
  );
}
