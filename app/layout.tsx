import type { Metadata } from "next";
import { Analytics } from "@/components/analytics/Analytics";
import { measurementId } from "@/lib/analytics/ga4";
import {
  Caveat,
  Funnel_Sans,
  Geist,
  Geist_Mono,
  Inter,
} from "next/font/google";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

const geist = Geist({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const funnelSans = Funnel_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-funnel-sans",
});

const caveat = Caveat({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "SmartTools",
  description: "Focused utilities for everyday work.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${inter.variable} ${geist.variable} ${geistMono.variable} ${funnelSans.variable} ${caveat.variable} print:bg-white`}
      lang="en"
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased print:bg-white print:text-black">
        <Analytics measurementId={measurementId(process.env)}>{children}</Analytics>
      </body>
    </html>
  );
}
