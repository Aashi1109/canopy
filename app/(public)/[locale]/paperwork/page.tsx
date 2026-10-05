import { getLocale, getTranslations } from "next-intl/server";
import { isLocale, defaultLocale } from "@/lib/i18n/config";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { getOptionalSession } from "@/lib/auth/session.ts";
import { getPaperworkTools } from "@/lib/tool-framework/catalog";
import { AccountNavigation, CatalogCard, PageHero, ProductHeader, StatusBadge } from "@/components/ui/index.tsx";
import {
  ClipboardCheck,
  ClipboardList,
  Compass,
  DollarSign,
  FileText,
  ReceiptText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { headers } from "next/headers";

const TOOL_ICONS: Record<string, LucideIcon> = {
  "invoice-generator": FileText,
  "receipt-generator": ReceiptText,
  "expense-report": ClipboardCheck,
  "mileage-log": Compass,
  "quarterly-tax-estimator": DollarSign,
  "w9-request": ClipboardList,
  "1099-nec-tracker": Sparkles,
};

export default async function HomePage() {
  const [requestedLocale, t] = await Promise.all([getLocale(), getTranslations("CatalogPage")]);
  const locale = isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  const requestHeaders = await headers();
  const [tools, session] = await Promise.all([getPaperworkTools(locale), getOptionalSession(requestHeaders)]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProductHeader
        account={{ returnTo: "/paperwork", user: session?.user ?? null }}
        actions={<AccountNavigation returnTo="/paperwork" user={session?.user ?? null} />}
        href="/paperwork"
        name="Paperwork"
      />
      <main>
        <PageHero
          compact
          description={t("paperworkDescription")}
          eyebrow={t("paperworkEyebrow")}
          title={t("paperworkTitle")}
        />

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => {
              if (!tool.slug) return null;
              const Icon = TOOL_ICONS[tool.componentKey] ?? FileText;

              return (
                <CatalogCard
                  action={<>{t("openTool")} →</>}
                  description={tool.description}
                  href={tool.href}
                  icon={<Icon aria-hidden="true" className="size-5" />}
                  key={tool.id}
                  status={<StatusBadge variant="success">{t("available")}</StatusBadge>}
                  title={tool.name}
                />
              );
            })}
          </div>
        </section>
      </main>
      <CanopyFooter />
    </div>
  );
}
