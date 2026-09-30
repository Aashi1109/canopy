import config from "@/lib/config/config.ts";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: {
    default: "PDF & Image Tools | SmartTools",
    template: "%s | SmartTools",
  },
  description: "Edit images and PDFs privately in your browser.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafc",
};

export default function MediaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="media-shell min-h-screen">{children}</div>;
}
