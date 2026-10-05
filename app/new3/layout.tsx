import type { ReactNode } from "react";
import { DocumentRoot, documentMetadata } from "@/components/i18n/DocumentRoot";

export const metadata = documentMetadata;

export default function NewThreeLayout({ children }: { children: ReactNode }) {
  return <DocumentRoot>{children}</DocumentRoot>;
}
