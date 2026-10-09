import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { Button, ContentState } from "@/components/ui/index.tsx";

export default function BlogNotFound() {
  const t = useTranslations("Blog");
  const locale = useLocale() as Locale;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8">
      <ContentState
        className="flex-1"
        state="unavailable"
        density="page"
        headingLevel="h1"
        icon={<BookOpen />}
        title={t("notFoundTitle")}
        description={t("notFoundDescription")}
        action={
          <Button asChild>
            <a href={localizeHref("/blog", locale)}>{t("exploreBlog")}</a>
          </Button>
        }
      />
    </div>
  );
}
