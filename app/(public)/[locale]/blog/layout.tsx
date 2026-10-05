import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { getOptionalSession } from "@/lib/auth/session.ts";
import { AccountNavigation, ProductHeader } from "@/components/ui/index.tsx";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";

export default async function BlogLayout({ children }: { children: ReactNode }) {
  const [session, t, locale] = await Promise.all([
    getOptionalSession(await headers()),
    getTranslations("Blog"),
    getLocale(),
  ]);
  const blogHref = localizeHref("/blog", locale as Locale);
  return (
    <div className="flex min-h-dvh flex-col bg-card text-foreground">
      <a className="sr-only focus:not-sr-only focus:p-4 focus:text-primary" href="#blog-main">
        {t("skipContent")}
      </a>
      <ProductHeader
        compact
        href={blogHref}
        name="SmartTools"
        account={{ returnTo: blogHref, user: session?.user ?? null }}
        actions={<AccountNavigation returnTo={blogHref} user={session?.user ?? null} />}
      />
      <main className="flex min-w-0 grow flex-col" id="blog-main">
        {children}
      </main>
      <CanopyFooter />
    </div>
  );
}
