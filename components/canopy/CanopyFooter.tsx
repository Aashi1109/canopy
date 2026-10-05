import { ProductFooter, SmartToolsLogoMark } from "@/components/ui/index.tsx";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, type Locale } from "@/lib/i18n/config";

/**
 * Suite and company navigation only — no tool is named here.
 *
 * The footer renders inside client trees (`components/UniversalWorkbench.tsx`,
 * `app/paperwork/components/App.tsx`), so it cannot await the DB-backed
 * `getTools`. A "Popular tools" column therefore has to arrive as data, and
 * `FEATURED_TOOL_IDS` (`lib/tool-framework/categories.ts`) is where that data
 * lands. It is deliberately empty today, so the column simply does not render
 * — the same treatment the devtools catalogue page gives its featured section.
 */
export function CanopyFooter({ publicOrigin }: { publicOrigin?: string } = {}) {
  const t = useTranslations("Common");
  const footer = useTranslations("Footer");
  const locale = useLocale() as Locale;
  const footerColumns = [
    {
      title: t("company"),
      links: [
        { href: "/", label: t("home") },
        { href: "/blog", label: t("blog") },
        { href: "/contact", label: t("contact") },
        { href: "/privacy", label: t("privacy") },
        { href: "/auth", label: t("signIn") },
      ],
    },
    {
      title: t("toolSuites"),
      links: [
        { href: "/paperwork", label: t("documents") },
        { href: "/devtools", label: t("developer") },
        { href: "/media", label: t("media") },
      ],
    },
  ];
  const columns = footerColumns.map((column) => ({
    ...column,
    links: column.links.map((link) => ({
      ...link,
      href:
        publicOrigin && link.href !== "/auth"
          ? new URL(localizeHref(link.href, locale), publicOrigin).href
          : localizeHref(link.href, locale),
    })),
  }));
  return (
    <ProductFooter
      brand="SmartTools"
      brandMark={<SmartToolsLogoMark aria-hidden="true" mode="dark" />}
      columns={columns}
      copyright={footer("copyright", { year: new Date().getFullYear() })}
      description={footer("description")}
    />
  );
}
