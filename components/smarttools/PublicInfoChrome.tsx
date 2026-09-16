import { getOptionalSession } from "@smarttools/auth/session";
import { AccountNavigation, ProductHeader } from "@smarttools/ui";
import { SmartToolsFooter } from "@/components/smarttools/SmartToolsFooter";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export default async function PublicInfoChrome({ children }: { children: ReactNode }) {
  const session = await getOptionalSession(await headers());

  return (
    <div className="flex min-h-screen flex-col bg-card text-foreground">
      <ProductHeader
        actions={<AccountNavigation returnTo="/" user={session?.user ?? null} />}
        className="min-h-[88px]"
        href="/"
        name="SmartTools"
      />
      <main className="grow">{children}</main>
      <SmartToolsFooter />
    </div>
  );
}
