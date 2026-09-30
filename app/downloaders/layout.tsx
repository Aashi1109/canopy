import config from "@/lib/config/config.ts";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: { default: "Video Downloaders | SmartTools", template: "%s | SmartTools" },
  description: "Download supported public videos with permission using our online service.",
};

export default function DownloadersLayout({ children }: { children: React.ReactNode }) {
  return <div className="media-shell min-h-screen">{children}</div>;
}
