import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getOptionalSession } from "@/lib/auth/session.ts";
import { AccountNavigation, ProductHeader } from "@/components/ui/index.tsx";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";

export default async function BlogLayout({ children }: { children: ReactNode }) {
  const session = await getOptionalSession(await headers());
  return (
    <div className="flex min-h-screen flex-col bg-card text-foreground">
      <a className="sr-only focus:not-sr-only focus:p-4 focus:text-primary" href="#blog-main">
        Skip to blog content
      </a>
      <ProductHeader
        compact
        href="/blog"
        name="SmartTools"
        account={{ returnTo: "/blog", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/blog" user={session?.user ?? null} />}
      />
      <main className="min-w-0 grow" id="blog-main">
        {children}
      </main>
      <CanopyFooter />
    </div>
  );
}
