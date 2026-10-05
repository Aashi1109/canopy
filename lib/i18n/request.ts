import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { defaultLocale, isLocale } from "./config";
import { getCommonMessages } from "./messages";

export default getRequestConfig(async ({ locale: override }) => {
  const requested = override ?? (await rootLocale());
  const locale = isLocale(requested) ? requested : defaultLocale;
  return { locale, messages: getCommonMessages(locale), timeZone: "UTC" };
});
