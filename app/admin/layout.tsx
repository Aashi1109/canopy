import { DocumentRoot, documentMetadata } from "@/components/i18n/DocumentRoot";
import type { Metadata } from "next";

export const metadata: Metadata = {
  ...documentMetadata,
  title: { default: "SmartTools Admin", template: "%s | SmartTools Admin" },
  description: "Manage SmartTools configuration, access, and audit history.",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <DocumentRoot>{children}</DocumentRoot>;
}
