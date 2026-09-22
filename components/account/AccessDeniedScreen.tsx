import { appHref } from "@/lib/routing/subdomains.ts";
import config from "@/lib/config/config.ts";
import {
  AccountNavigation,
  Caption,
  H1,
  InlineCode,
  Muted,
  ProductHeader,
  Strong,
  Text,
  buttonVariants,
} from "@/components/ui/index.tsx";
import { SwitchAccountButton } from "@/components/ui/components/AccountNavigation.tsx";
import { Mail, ShieldX } from "lucide-react";

export function AccessDeniedScreen({
  suspended = false,
  checked = false,
  user,
}: {
  suspended?: boolean;
  checked?: boolean;
  user: { name: string; isAdmin?: boolean };
}) {
  const accountName = user.name.trim() || "Signed-in account";
  const initials =
    accountName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "ST";
  const returnTo = suspended ? "/" : appHref("/admin");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ProductHeader
        actions={
          <AccountNavigation
            isAdminPage={!suspended}
            restricted={suspended}
            returnTo={returnTo}
            user={user}
            publicSiteUrl={config.appUrl}
          />
        }
        href={config.appUrl}
        publicSiteUrl={config.appUrl}
        minimal
        name="SmartTools"
      />
      <main className="grid flex-1 place-items-center px-4 py-10">
        <section
          className="flex w-full max-w-[620px] flex-col items-center gap-[18px] rounded-xl border border-border bg-card p-6 text-center shadow-lg sm:p-9"
          aria-labelledby="denied-title"
        >
          <span className="grid size-16 place-items-center rounded-xl bg-destructive-soft text-destructive">
            <ShieldX aria-hidden="true" className="size-[30px]" />
          </span>
          <Caption className="block text-destructive">{suspended ? "ACCOUNT SUSPENDED" : "ERROR 403"}</Caption>
          <H1 className="text-foreground" id="denied-title">
            {suspended ? "Your account is suspended" : "You don’t have access to Admin"}
          </H1>
          <Muted className="max-w-[500px] text-muted-foreground">
            {suspended
              ? "You’re signed in, but your account can’t access SmartTools while suspended. Contact an administrator to request reactivation."
              : "Your current role can’t view administrative tools, users, roles, or audit history. Your account is still signed in and no changes were made."}
          </Muted>
          <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted p-3.5 text-left">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary"
            >
              <Text>{initials}</Text>
            </span>
            <span className="min-w-0 flex-1">
              <Strong className="block truncate">{accountName}</Strong>
              {suspended ? (
                <Caption className="mt-0.5 block text-muted-foreground">Status: Suspended</Caption>
              ) : (
                <InlineCode className="mt-0.5 block truncate text-muted-foreground">
                  Required permission: admin.enter
                </InlineCode>
              )}
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5">
            <SwitchAccountButton returnTo={returnTo} />
            {suspended ? (
              <a className={buttonVariants()} href="/account/suspended?checked=1">
                Check access again
              </a>
            ) : (
              <a className={buttonVariants()} href={new URL("/paperwork", config.appUrl).href}>
                Return to Paperwork
              </a>
            )}
          </div>
          {suspended && checked ? (
            <Caption role="status">Access checked. Your account is still suspended.</Caption>
          ) : null}
          <Caption className="inline-flex items-center gap-2 text-muted-foreground">
            <Mail aria-hidden="true" className="size-3.5 shrink-0" />
            {suspended
              ? "An administrator must reactivate your account to restore access."
              : "Need access? Contact an administrator for the appropriate role."}
          </Caption>
        </section>
      </main>
    </div>
  );
}
