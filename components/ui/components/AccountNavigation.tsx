"use client";
import { Caption, P } from "./typography.tsx";

import {
  ArrowLeftRight,
  BookOpen,
  Braces,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CodeXml,
  FileCode,
  FileOutput,
  Files,
  FolderTree,
  Globe,
  ImagePlay,
  Images,
  KeyRound,
  LayoutGrid,
  LogOut,
  Minimize2,
  Network,
  Palette,
  ScanLine,
  Shield,
  Sparkles,
  Table2,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "./button.tsx";
import { PreviewIcon, useEcosystemGroups } from "./EcosystemTabFilters.tsx";
import { cn } from "../lib/utils.ts";

export type AccountNavigationProps = {
  className?: string;
  returnTo: string;
  restricted?: boolean;
  user: { name: string; isAdmin?: boolean } | null;
};

const itemClassName =
  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4";

export const SITE_NAVIGATION_ITEMS = [
  { href: "/", label: "All tools", icon: LayoutGrid },
  { href: "/paperwork", label: "Documents", icon: Files },
  { href: "/devtools", label: "Developer", icon: CodeXml },
  { href: "/media", label: "Media", icon: ImagePlay },
  { href: "/blog", label: "Blog", icon: BookOpen },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "json-tools": Braces,
  "csv-data-tools": Table2,
  "text-tools": Type,
  "encoding-decoding": ArrowLeftRight,
  "hashing-crypto": Shield,
  "jwt-api-tools": KeyRound,
  "web-markup-tools": FileCode,
  "color-design-tools": Palette,
  "date-time-tools": CalendarClock,
  "developer-generators": Sparkles,
  "diagram-tools": Network,
  "seo-domain-tools": Globe,
  "pdf-conversion": FileOutput,
  "pdf-organization": FolderTree,
  "pdf-optimization": Minimize2,
  "image-conversion": Images,
  "image-editing": ScanLine,
};

export function useSignOut(destination: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.assign(destination);
    } catch {
      setError("Couldn’t log out. Please try again.");
      setPending(false);
    }
  }

  return { pending, error, signOut };
}

export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
  const { pending, error, signOut } = useSignOut(`/auth?${new URLSearchParams({ returnTo })}`);

  return (
    <div>
      <Button disabled={pending} onClick={() => void signOut()} variant="secondary">
        {pending ? "Signing out…" : "Switch account"}
      </Button>
      {error ? (
        <P className="mt-2 text-destructive" role="alert">
          {error}
        </P>
      ) : null}
    </div>
  );
}

export function AccountNavigation({ className, returnTo, restricted = false, user }: AccountNavigationProps) {
  const [open, setOpen] = useState(false);
  const groups = useEcosystemGroups(open && !restricted);
  const { pending, error, signOut } = useSignOut(restricted ? "/auth" : "/");
  const target = `${user ? "/auth/profile" : "/auth"}?${new URLSearchParams({ returnTo })}`;
  const accountName = user?.name.trim() || "Account";
  const initials = accountName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <nav aria-label="Account" className={cn("flex items-center", className)}>
      {user ? (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
          <DropdownMenu.Trigger asChild>
            <Button
              aria-label={`Open account menu for ${accountName}`}
              className="group h-10 max-w-32 gap-2 rounded-full border border-border bg-muted py-1 pr-2.5 pl-1 text-foreground hover:border-primary/40 hover:bg-accent sm:max-w-48"
              title={accountName}
              variant="ghost"
            >
              <Caption
                aria-hidden="true"
                className="grid size-[30px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                {initials}
              </Caption>
              <Caption className="truncate">{accountName}</Caption>
              <ChevronDown aria-hidden="true" className="size-[13px] shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              collisionPadding={12}
              className="z-[100] max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
              {!restricted ? (
                <DropdownMenu.Group className="[@media(width>1024px)]:hidden">
                  {SITE_NAVIGATION_ITEMS.map(({ href, label, icon: Icon }) => {
                    const group = groups.find((group) => group.href === href);
                    if (!group)
                      return (
                        <DropdownMenu.Item asChild className={itemClassName} key={href}>
                          <a href={href}>
                            <Icon aria-hidden="true" />
                            {label}
                          </a>
                        </DropdownMenu.Item>
                      );
                    const links =
                      group.id !== "documents" && group.categories.length
                        ? group.categories.map((category) => ({
                            ...category,
                            CategoryIcon:
                              CATEGORY_ICONS[new URLSearchParams(category.href.split("?")[1]).get("category") ?? ""] ??
                              LayoutGrid,
                          }))
                        : group.tools.map((tool) => ({ href: tool.href, label: tool.name, icon: tool.icon }));
                    return (
                      <DropdownMenu.Sub key={href}>
                        <DropdownMenu.SubTrigger className={cn(itemClassName, "data-[state=open]:bg-accent")}>
                          <Icon aria-hidden="true" />
                          {label}
                          <ChevronRight aria-hidden="true" className="ml-auto" />
                        </DropdownMenu.SubTrigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.SubContent
                            sideOffset={4}
                            collisionPadding={12}
                            className="z-[100] max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg [@media(width>1024px)]:hidden"
                          >
                            <DropdownMenu.Item asChild className={itemClassName}>
                              <a href={href}>
                                <Icon aria-hidden="true" />
                                All {label.toLowerCase()} tools
                              </a>
                            </DropdownMenu.Item>
                            {links.length ? <DropdownMenu.Separator className="my-1 h-px bg-border" /> : null}
                            {links.map((link) => (
                              <DropdownMenu.Item asChild className={itemClassName} key={link.href}>
                                <a href={link.href}>
                                  {"icon" in link ? (
                                    <PreviewIcon icon={link.icon} />
                                  ) : (
                                    <link.CategoryIcon aria-hidden="true" className="shrink-0" />
                                  )}
                                  {link.label}
                                </a>
                              </DropdownMenu.Item>
                            ))}
                          </DropdownMenu.SubContent>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Sub>
                    );
                  })}
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                </DropdownMenu.Group>
              ) : null}
              {!restricted && user.isAdmin ? (
                <DropdownMenu.Item asChild className={itemClassName}>
                  <a href="/admin">
                    <Shield aria-hidden="true" />
                    Admin page
                  </a>
                </DropdownMenu.Item>
              ) : null}
              {!restricted ? (
                <DropdownMenu.Item asChild className={itemClassName}>
                  <a href={target}>
                    <UserRound aria-hidden="true" />
                    My profile
                  </a>
                </DropdownMenu.Item>
              ) : null}
              {!restricted ? <DropdownMenu.Separator className="my-1 h-px bg-border" /> : null}
              <DropdownMenu.Item
                aria-label={pending ? "Logging out…" : "Log out"}
                className={cn(itemClassName, "text-destructive")}
                disabled={pending}
                onSelect={(event) => {
                  event.preventDefault();
                  void signOut();
                }}
              >
                <LogOut aria-hidden="true" />
                <span role="status">{pending ? "Logging out…" : "Log out"}</span>
              </DropdownMenu.Item>
              {error ? (
                <P className="px-3 py-2 text-destructive" role="alert">
                  {error}
                </P>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : (
        <a
          className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground no-underline outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          href={target}
        >
          Sign in
        </a>
      )}
    </nav>
  );
}
