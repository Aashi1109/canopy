import { DocumentRoot, documentMetadata } from "@/components/i18n/DocumentRoot";

export const metadata = documentMetadata;

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <DocumentRoot publicTracking={false}>{children}</DocumentRoot>;
}
