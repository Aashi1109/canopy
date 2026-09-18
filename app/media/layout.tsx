import config from "@/lib/config/config.ts";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: {
    default: "SmartTools Media Tools",
    template: "%s | SmartTools Media Tools",
  },
  description: "Private image and PDF tools that process files entirely in your browser.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafc",
};

export default function MediaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="media-shell min-h-screen">{children}</div>;
}
