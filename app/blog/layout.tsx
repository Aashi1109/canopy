import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getOptionalSession } from "@smarttools/auth/session";
import { AccountNavigation, ProductHeader } from "@smarttools/ui";
import { SmartToolsFooter } from "@/components/smarttools/SmartToolsFooter";
import { BlogMobileNavigation } from "./components/BlogMobileNavigation";

export default async function BlogLayout({ children }: { children: ReactNode }) {
  const session = await getOptionalSession(await headers());
  return <div className="flex min-h-screen flex-col bg-card text-foreground">
    <a className="sr-only focus:not-sr-only focus:p-4 focus:text-primary" href="#blog-main">Skip to blog content</a>
    <ProductHeader compact showSearch={false} href="/blog" name="SmartTools" mobileActions={<BlogMobileNavigation signedIn={!!session?.user} isAdmin={session?.user.isAdmin ?? false} />} actions={<AccountNavigation returnTo="/blog" user={session?.user ?? null} />} />
    <main className="min-w-0 grow" id="blog-main">{children}</main>
    <SmartToolsFooter />
  </div>;
}
