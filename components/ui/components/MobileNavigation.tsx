"use client";

import { ArrowLeft, LogOut, Menu, Shield, UserRound, X } from "lucide-react";
import { SavedToolsTrigger } from "./SavedTools.tsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GlobalToolSearch } from "./GlobalToolSearch.tsx";
import { SITE_NAVIGATION_ITEMS, useSignOut, type AccountNavigationProps } from "./AccountNavigation.tsx";
import { cn } from "../lib/utils.ts";

const linkClass =
  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-base font-medium text-foreground no-underline outline-none hover:bg-accent hover:text-accent-foreground hover:[&_svg]:text-current focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:text-primary";

export function MobileNavigation({
  account,
  currentHref,
  showSearch = true,
}: {
  account?: AccountNavigationProps;
  currentHref: string;
  showSearch?: boolean;
}) {
  const [panel, setPanel] = useState<"menu" | "search" | null>(null);
  const [position, setPosition] = useState({ top: 72, availableHeight: 600 });
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const user = account?.user;
  const returnTo = account?.returnTo ?? currentHref;
  const target = `${user ? "/auth/profile" : "/auth"}?${new URLSearchParams({ returnTo })}`;
  const { pending, error, signOut } = useSignOut(account?.restricted ? "/auth" : "/");
  const name = user?.name.trim() || "Account";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const setSearchOpen = useCallback(
    (open: boolean) => setPanel((previous) => (open ? "search" : previous === "search" ? null : previous)),
    [],
  );

  useEffect(() => {
    if (!panel) return;
    const update = () => {
      const top = root.current?.closest("header")?.getBoundingClientRect().bottom ?? 72;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      setPosition({ top, availableHeight: Math.max(100, bottom - top - 16) });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [panel]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const reset = () => {
      if (desktop.matches) setPanel(null);
    };
    desktop.addEventListener("change", reset);
    return () => desktop.removeEventListener("change", reset);
  }, []);

  useEffect(() => {
    if (panel !== "menu") return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node))
        setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanel(null);
        toggle.current?.focus();
      }
    }
    // Move keyboard focus into the portalled navigation without opening a keyboard.
    menu.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [panel]);

  return (
    <div ref={root} className="flex shrink-0 items-center gap-2 md:hidden">
      {showSearch ? (
        <GlobalToolSearch mobile={{ open: panel === "search", onOpenChange: setSearchOpen, ...position }} />
      ) : null}
      <button
        ref={toggle}
        data-mobile-menu-toggle
        type="button"
        aria-label={
          panel === "menu"
            ? "Close navigation menu"
            : user
              ? `Open navigation and account menu for ${name}`
              : "Open navigation menu"
        }
        aria-expanded={panel === "menu"}
        aria-controls={panel === "menu" ? menuId : undefined}
        className={cn(
          "flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-input bg-card text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
          user ? "px-2.5" : "w-11",
        )}
        onClick={() => setPanel((previous) => (previous === "menu" ? null : "menu"))}
      >
        {user ? (
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full bg-accent text-[11px] font-semibold text-primary"
          >
            {initials}
          </span>
        ) : null}
        {panel === "menu" ? (
          <X aria-hidden="true" className="size-5" />
        ) : (
          <Menu aria-hidden="true" className="size-5" />
        )}
      </button>
      {panel
        ? createPortal(
            <>
              <div
                aria-hidden="true"
                className={cn("fixed inset-x-0 bottom-0 z-40 md:hidden", panel === "search" && "bg-black/[0.19]")}
                style={{ top: position.top }}
                onPointerDown={() => setPanel(null)}
              />
              {panel === "menu" ? (
                <div
                  ref={menu}
                  id={menuId}
                  className="fixed inset-x-0 bottom-0 z-[60] overflow-y-auto overscroll-contain border-b border-border bg-card px-4 py-5 text-foreground shadow-lg md:hidden"
                  style={{ top: position.top }}
                >
                  <p className="text-xl font-semibold">Explore SmartTools</p>
                  <p className="mt-1 text-sm text-muted-foreground">Find a tool. Get something done.</p>
                  <nav aria-label="Mobile site navigation" className="mt-3">
                    {SITE_NAVIGATION_ITEMS.map(({ href, label, icon: Icon }) => (
                      <a
                        key={href}
                        href={href}
                        className={linkClass}
                        aria-current={currentHref === href ? "page" : undefined}
                        onClick={() => setPanel(null)}
                      >
                        <Icon aria-hidden="true" className="size-[18px] text-muted-foreground" />
                        {label}
                      </a>
                    ))}
                  </nav>
                  <div className="mt-2 space-y-3 border-t border-border pt-2">
                    <SavedToolsTrigger menu className={linkClass} onActivate={() => setPanel(null)} />
                    {user ? (
                      <div role="group" aria-label="Account" className="space-y-1 rounded-xl bg-muted p-2">
                        <div className="flex min-w-0 items-center gap-3 px-1 pt-2 pb-3">
                          <span
                            aria-hidden="true"
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary"
                          >
                            {initials}
                          </span>
                          <span className="min-w-0 break-words text-sm font-semibold">{name}</span>
                        </div>
                        {!account?.restricted ? (
                          <a href={target} className={linkClass} onClick={() => setPanel(null)}>
                            <UserRound aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
                            My profile
                          </a>
                        ) : null}
                        {!account?.restricted && user.isAdmin ? (
                          <a
                            href={account?.isAdminPage ? "/" : "/admin"}
                            className={linkClass}
                            onClick={() => setPanel(null)}
                          >
                            {account?.isAdminPage ? (
                              <ArrowLeft aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
                            ) : (
                              <Shield aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
                            )}
                            {account?.isAdminPage ? "Back to product" : "Admin page"}
                          </a>
                        ) : null}
                        <div className="border-t border-border pt-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void signOut()}
                            className={cn(
                              linkClass,
                              "w-full text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-60",
                            )}
                          >
                            <LogOut aria-hidden="true" className="size-[18px] shrink-0" />
                            <span role="status">{pending ? "Signing out…" : "Sign out"}</span>
                          </button>
                        </div>
                        {error ? (
                          <p className="px-3 text-sm text-destructive" role="alert">
                            {error}
                          </p>
                        ) : null}
                      </div>
                    ) : account?.showSignIn !== false ? (
                      <a
                        href={target}
                        className="flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground no-underline focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setPanel(null)}
                      >
                        Sign in
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
