"use client";

import { Code, Columns2, Eye, Maximize2, Minimize2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "./button.tsx";
import { Tabs, TabsList, TabsTrigger } from "./tabs.tsx";

export type WorkbenchView = "input" | "split" | "preview";

type Presentation = {
  focused: boolean;
  setFocused: (focused: boolean) => void;
  view: WorkbenchView;
  setView: (view: WorkbenchView) => void;
  hasPanes: boolean;
  registerPanes: (id: string) => () => void;
  narrow: boolean;
};

const PresentationContext = createContext<Presentation | null>(null);

export function WorkbenchPresentationProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const [view, setView] = useState<WorkbenchView>("split");
  const [panes, setPanes] = useState<ReadonlySet<string>>(new Set());
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = matchMedia("(max-width: 64rem)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const registerPanes = useCallback((id: string) => {
    setPanes((previous) => new Set(previous).add(id));
    return () =>
      setPanes((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
  }, []);
  const value = useMemo(
    () => ({ focused, setFocused, view, setView, hasPanes: panes.size > 0, registerPanes, narrow }),
    [focused, view, panes, registerPanes, narrow],
  );
  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function useWorkbenchPresentation() {
  return useContext(PresentationContext);
}

/** Only actual input/result pairs register; settings and two-input comparisons do not. */
export function useWorkbenchPaneView(enabled: boolean) {
  const context = useWorkbenchPresentation();
  const id = useId();
  const register = context?.registerPanes;
  useEffect(() => {
    if (enabled && register) return register(id);
  }, [enabled, id, register]);
  if (!enabled || !context?.focused) return "split";
  return context.narrow && context.view === "split" ? "input" : context.view;
}

export function WorkbenchViewControl() {
  const context = useWorkbenchPresentation();
  if (!context?.focused || !context.hasPanes) return null;
  const value = context.narrow && context.view === "split" ? "input" : context.view;
  return (
    <Tabs value={value} onValueChange={(next) => context.setView(next as WorkbenchView)}>
      <TabsList aria-label="Workspace view" variant="line">
        <TabsTrigger className="h-8 py-0 text-[13px] data-[state=active]:text-primary" value="input">
          <Code aria-hidden="true" />
          Input
        </TabsTrigger>
        {!context.narrow && (
          <TabsTrigger className="h-8 py-0 text-[13px] data-[state=active]:text-primary" value="split">
            <Columns2 aria-hidden="true" />
            Split
          </TabsTrigger>
        )}
        <TabsTrigger className="h-8 py-0 text-[13px] data-[state=active]:text-primary" value="preview">
          <Eye aria-hidden="true" />
          Preview
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function WorkbenchFocusButton() {
  const context = useWorkbenchPresentation();
  if (!context) return null;
  const Icon = context.focused ? Minimize2 : Maximize2;
  return (
    <Button
      aria-pressed={context.focused}
      data-workbench-focus-trigger
      onClick={() => context.setFocused(!context.focused)}
      size="sm"
      variant="outline"
    >
      <Icon aria-hidden="true" />
      {context.focused ? "Exit focus mode" : "Expand workspace"}
    </Button>
  );
}

/** Animate layout changes without remounting content or delaying interaction. */
export function useWorkbenchMotion(container: RefObject<HTMLElement | null>, state: boolean | string) {
  const previous = useRef(state);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    if (previous.current === state) return;
    previous.current = state;
    animation.current?.cancel();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animation.current = element.animate([{ opacity: 0.96 }, { opacity: 1 }], { duration: 180, easing: "ease-in-out" });
  }, [container, state]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => {
      if (preference.matches) animation.current?.cancel();
    };
    preference.addEventListener("change", cancel);
    return () => {
      preference.removeEventListener("change", cancel);
      animation.current?.cancel();
    };
  }, [container]);
}

/** Expand the existing DOM, never portal or remount the editor. */
export function useWorkbenchFocus(container: RefObject<HTMLElement | null>) {
  const context = useWorkbenchPresentation();
  const requestedFocus = context?.focused ?? false;
  const [holdingFocus, setHoldingFocus] = useState(false);
  const focused = requestedFocus || holdingFocus;
  const setFocused = context?.setFocused;
  const normalBounds = useRef<DOMRect | null>(null);
  const focusAnimation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    if (!requestedFocus && !holdingFocus) {
      focusAnimation.current?.cancel();
      normalBounds.current = element.getBoundingClientRect();
      return;
    }
    const current = element.getBoundingClientRect();
    const interrupted = focusAnimation.current?.playState === "running";
    focusAnimation.current?.cancel();
    const normal = normalBounds.current ?? current;
    const from = requestedFocus && !interrupted ? normal : current;
    const to = requestedFocus ? element.getBoundingClientRect() : normal;
    if (requestedFocus) setHoldingFocus(true);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!requestedFocus) setHoldingFocus(false);
      return;
    }
    const geometry = (rect: DOMRect) => ({
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${Math.min(rect.height, innerHeight)}px`,
      right: "auto",
      bottom: "auto",
    });
    const animation = element.animate([geometry(from), geometry(to)], {
      duration: 320,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "both",
    });
    focusAnimation.current = animation;
    void animation.finished
      .then(() => {
        if (focusAnimation.current !== animation) return;
        if (requestedFocus) animation.cancel();
        else setHoldingFocus(false);
      })
      .catch(() => {});
    // holdingFocus keeps the fixed frame in place until the closing animation finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, requestedFocus]);
  useLayoutEffect(() => {
    if (!focused) focusAnimation.current?.cancel();
  }, [focused]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => {
      if (!preference.matches) return;
      focusAnimation.current?.cancel();
      setHoldingFocus(false);
    };
    preference.addEventListener("change", cancel);
    return () => {
      preference.removeEventListener("change", cancel);
      focusAnimation.current?.cancel();
    };
  }, []);
  const [placeholderHeight, setPlaceholderHeight] = useState<number>();
  const lastHeight = useRef<number>(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      if (!focused) {
        lastHeight.current = element.offsetHeight;
        normalBounds.current = element.getBoundingClientRect();
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
    };
  }, [container, focused]);
  useEffect(() => {
    if (!focused || !setFocused || !container.current) return;
    const element = container.current;
    const scroll = { x: window.scrollX, y: window.scrollY };
    const overflow = document.body.style.overflow;
    setPlaceholderHeight(lastHeight.current);
    document.body.style.overflow = "hidden";
    const background: { element: HTMLElement; inert: boolean; visibility: string }[] = [];
    let ancestor: HTMLElement | null = element;
    while (ancestor && ancestor !== document.body) {
      for (const sibling of ancestor.parentElement?.children ?? []) {
        if (
          !(sibling instanceof HTMLElement) ||
          sibling === ancestor ||
          sibling.matches(
            'script, style, [role="dialog"], [role="alertdialog"], [data-slot*="toast"], [data-base-ui-portal]',
          )
        )
          continue;
        background.push({ element: sibling, inert: sibling.inert, visibility: sibling.style.visibility });
        sibling.inert = true;
        sibling.style.visibility = "hidden";
      }
      ancestor = ancestor.parentElement;
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Menus, dialogs and editor completions get first refusal.
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open], .cm-tooltip-autocomplete',
        )
      )
        return;
      event.preventDefault();
      setFocused?.(false);
    }
    document.addEventListener("keydown", escape);
    const frameDocuments = new Set<Document>();
    const frames = new Set<HTMLIFrameElement>();
    const attachFrames = () => {
      for (const frame of element.querySelectorAll("iframe")) {
        if (!frames.has(frame)) {
          frames.add(frame);
          frame.addEventListener("load", attachFrames);
        }
        try {
          const childDocument = frame.contentDocument;
          if (childDocument && !frameDocuments.has(childDocument)) {
            frameDocuments.add(childDocument);
            childDocument.addEventListener("keydown", escape);
          }
        } catch {
          // Cross-origin previews retain their own keyboard boundary.
        }
      }
    };
    attachFrames();
    const frameObserver = new MutationObserver(attachFrames);
    frameObserver.observe(element, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("keydown", escape);
      frameObserver.disconnect();
      for (const frame of frames) frame.removeEventListener("load", attachFrames);
      for (const childDocument of frameDocuments) childDocument.removeEventListener("keydown", escape);
      document.body.style.overflow = overflow;
      for (const item of background) {
        item.element.inert = item.inert;
        item.element.style.visibility = item.visibility;
      }
      setPlaceholderHeight(undefined);
      window.scrollTo(scroll.x, scroll.y);
      element.querySelector<HTMLElement>("[data-workbench-focus-trigger]")?.focus({ preventScroll: true });
    };
  }, [container, focused, setFocused]);
  return { focused, placeholderHeight };
}
