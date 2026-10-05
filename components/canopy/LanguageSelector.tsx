"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { isLocale, isPublicPagePath, localeLabels, locales, unlocalizedPathname, type Locale } from "@/lib/i18n/config";
import { useRouter } from "@/lib/i18n/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/components/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/components/alert-dialog";
import { toast } from "@/components/ui/components/toast";

export function LanguageSelector() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestedLocale, setRequestedLocale] = useState<Locale | null>(null);
  const [availableLocales, setAvailableLocales] = useState<readonly Locale[]>(locales);

  function refreshAvailableLocales() {
    const value = document.querySelector<HTMLElement>("[data-tool-locales]")?.dataset.toolLocales;
    if (value === undefined) return setAvailableLocales(locales);
    try {
      const parsed: unknown = JSON.parse(value);
      const allowed = Array.isArray(parsed) ? parsed.filter(isLocale) : [];
      setAvailableLocales(locales.filter((item) => allowed.includes(item)));
    } catch {
      setAvailableLocales([]);
    }
  }

  useEffect(() => {
    refreshAvailableLocales();
  }, [pathname]);

  function switchLocale(nextLocale: Locale, confirmed = false) {
    if (nextLocale === locale || pending || !availableLocales.includes(nextLocale)) return;
    if (document.querySelector('[data-language-switch-state="running"]')) {
      toast.info(t("runningWarning"));
      return;
    }
    if (!confirmed && document.querySelector('[data-language-switch-state="dirty"]')) {
      setRequestedLocale(nextLocale);
      return;
    }
    setRequestedLocale(null);
    const target = `${unlocalizedPathname(window.location.pathname)}${window.location.search}${window.location.hash}`;
    startTransition(() => router.replace(target, { locale: nextLocale, scroll: false }));
  }

  if (!pathname || !isPublicPagePath(pathname)) return null;

  return (
    <>
      <Select
        value={locale}
        disabled={pending}
        onOpenChange={(open) => {
          if (open) refreshAvailableLocales();
        }}
        onValueChange={(value) => {
          if (isLocale(value)) switchLocale(value);
        }}
      >
        <SelectTrigger className="h-10 w-auto min-w-20 gap-1.5 rounded-full px-2.5" aria-label={t("language")}>
          <Globe aria-hidden="true" className="size-4 shrink-0" />
          <SelectValue>
            <span className="text-xs uppercase">{pending ? t("switching") : locale.split("-")[0]}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] max-h-[min(28rem,var(--radix-select-content-available-height))] max-w-[calc(100vw-24px)] rounded-xl bg-popover p-0.5 text-popover-foreground"
        >
          {locales.map((item) => (
            <SelectItem
              key={item}
              value={item}
              disabled={!availableLocales.includes(item)}
              className="min-h-10 cursor-pointer rounded-md py-2 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <span lang={item}>{localeLabels[item]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog
        open={requestedLocale !== null}
        onOpenChange={(open) => {
          if (!open) setRequestedLocale(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="sm:text-start">
            <AlertDialogTitle>{t("switchLanguage")}</AlertDialogTitle>
            <AlertDialogDescription>{t("switchWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (requestedLocale) switchLocale(requestedLocale, true);
              }}
            >
              {t("continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
