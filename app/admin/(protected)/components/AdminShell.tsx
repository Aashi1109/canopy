"use client";

import {
  Caption,
  BrandLockup,
  AccountNavigation,
  type AccountNavigationProps,
} from "@smarttools/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNavigation } from "./AdminNavigation";

function isFullPageTemplateLifecycle(pathname: string) {
  return (
    pathname === "/admin/templates/new" ||
    pathname.startsWith("/admin/templates/new/") ||
    pathname === "/admin/templates/import" ||
    /^\/admin\/templates\/[^/]+\/(?:advanced|manage)\/?$/.test(pathname)
  );
}

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AccountNavigationProps["user"];
}) {
  const pathname = usePathname();
  const isToolsCatalog = pathname === "/admin/tools";
  const isBlogDocument =
    pathname.startsWith("/admin/blog/") && !pathname.startsWith("/admin/blog/taxonomy");

  if (isBlogDocument) {
    return <main className="fixed inset-0 overflow-hidden bg-card">{children}</main>;
  }

  if (isFullPageTemplateLifecycle(pathname)) {
    return <main className="min-h-dvh overflow-y-auto bg-muted">{children}</main>;
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <header className="z-50 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-surface-ink px-4 text-on-ink sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <BrandLockup
            className="h-11 shrink-0 items-center text-on-ink hover:text-on-ink-muted focus-visible:ring-offset-surface-ink [&>img]:size-8 [&>span]:h-auto [&>span]:font-semibold"
            href="/admin/tools"
            name="SmartTools"
          />
          <Caption className="border-l border-white/15 pl-3 text-on-ink-muted">Admin</Caption>
        </div>
        <div className="flex items-center gap-3">
          <Caption className="hidden rounded-full bg-white/10 px-3 py-1.5 text-on-ink-muted sm:inline-flex">
            CONTROL PLANE
          </Caption>
          <AccountNavigation
            className="max-sm:[&_button>.truncate]:hidden [&_a]:border-white/15 [&_a]:bg-white/10 [&_a]:text-on-ink [&_a:hover]:bg-white/15"
            returnTo="/admin"
            user={user}
          />
        </div>
      </header>
      <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
        {!isBlogDocument && (
          <aside className="shrink-0 overflow-hidden border-b border-border bg-card px-4 py-3 lg:h-full lg:w-60 lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
            <Caption className="block mb-3 hidden px-3 text-muted-foreground lg:block">
              WORKSPACE
            </Caption>
            <AdminNavigation />
            <div className="mt-6 hidden rounded-lg bg-muted p-3 lg:block">
              <Caption className="block">Code is the source</Caption>
              <Caption className="block mt-1.5 text-muted-foreground">
                Routes and capabilities are registered at build time.
              </Caption>
            </div>
          </aside>
        )}
        <main
          className={
            isBlogDocument
              ? "min-h-0 min-w-0 flex-1 overflow-hidden"
              : `min-h-0 min-w-0 flex-1 overscroll-contain px-4 py-6 sm:px-6 lg:px-7 lg:py-7 ${
                  isToolsCatalog ? "overflow-y-auto lg:overflow-hidden" : "overflow-y-auto"
                }`
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
