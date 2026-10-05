import { DocumentRoot, documentMetadata } from "@/components/i18n/DocumentRoot";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  ...documentMetadata,
  title: "Account | SmartTools",
  description: "Sign in and manage your SmartTools account.",
};

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <DocumentRoot>{children}</DocumentRoot>;
}
