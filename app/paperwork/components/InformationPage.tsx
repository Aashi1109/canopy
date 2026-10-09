import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { getOptionalSession } from "@/lib/auth/session.ts";
import {
  AccountNavigation,
  AppContainer,
  Button,
  Card,
  ProductHeader,
  ToolPageHeader,
} from "@/components/ui/index.tsx";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale, localizeHref } from "@/lib/i18n/config";

export default async function InformationPage({
  children,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  const requestHeaders = await headers();
  const session = await getOptionalSession(requestHeaders);
  const requestedLocale = await getLocale();
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const t = await getTranslations("About");
  const paperworkHref = localizeHref("/paperwork", locale);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProductHeader
        account={{ returnTo: paperworkHref, user: session?.user ?? null }}
        actions={<AccountNavigation returnTo={paperworkHref} user={session?.user ?? null} />}
        href={paperworkHref}
        name="Paperwork"
      />
      <main className="grow py-12 sm:py-16">
        <AppContainer>
          <Button
            asChild
            className="mb-8 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            variant="ghost"
          >
            <a href={paperworkHref}>
              <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
              {t("back")}
            </a>
          </Button>
          <ToolPageHeader className="max-w-3xl" description={description} eyebrow={eyebrow} title={title} />
          <Card className="max-w-3xl space-y-7 p-6 sm:p-8">{children}</Card>
        </AppContainer>
      </main>
      <CanopyFooter />
    </div>
  );
}
