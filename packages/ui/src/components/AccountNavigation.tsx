"use client";
import { Caption, P } from "#components/typography";

import { ChevronDown, LogOut, Shield, UserRound } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Button } from "./button.tsx";
import { cn } from "../lib/utils.ts";

export type AccountNavigationProps = {
  className?: string;
  returnTo: string;
  restricted?: boolean;
  user: { name: string; isAdmin?: boolean } | null;
};

const itemClassName =
  "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4";

function useSignOut(destination: string) {
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
        <DropdownMenu.Root>
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
              className="z-[100] w-56 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
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
