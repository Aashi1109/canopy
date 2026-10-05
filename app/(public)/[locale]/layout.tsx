import { notFound } from "next/navigation";
import { DocumentRoot, documentMetadata } from "@/components/i18n/DocumentRoot";
import { isLocale } from "@/lib/i18n/config";

export const metadata = documentMetadata;

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <DocumentRoot locale={locale}>{children}</DocumentRoot>;
}
