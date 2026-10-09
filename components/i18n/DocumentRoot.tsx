import config from "@/lib/config/config.ts";
import type { Metadata } from "next";
import { SavedToolsProvider } from "@/components/ui/index.tsx";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@/components/analytics/Analytics";
import { measurementId } from "@/lib/analytics/ga4";
import { Caveat, Funnel_Sans, Geist, Geist_Mono, Inter } from "next/font/google";
import "@/app/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { defaultLocale, direction, type Locale } from "@/lib/i18n/config";
import { getCommonMessages } from "@/lib/i18n/messages";
import { DirectionProvider } from "./DirectionProvider";

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
  preload: false,
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
  preload: false,
  subsets: ["latin"],
  variable: "--font-caveat",
});

export const documentMetadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: "SmartTools",
  description: "Focused utilities for everyday work.",
  applicationName: "SmartTools",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: [{ url: "/logo.svg", type: "image/svg+xml", sizes: "any" }],
  },
};

export function DocumentRoot({
  children,
  locale = defaultLocale,
}: Readonly<{ children: React.ReactNode; locale?: Locale }>) {
  return (
    <html
      className={`${inter.variable} ${geist.variable} ${geistMono.variable} ${funnelSans.variable} ${caveat.variable} print:bg-white`}
      data-scroll-behavior="smooth"
      lang={locale}
      dir={direction(locale)}
    >
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5442003096820885"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased print:bg-white print:text-black">
        <NextIntlClientProvider locale={locale} messages={getCommonMessages(locale)} timeZone="UTC">
          <DirectionProvider dir={direction(locale)}>
            <SavedToolsProvider publicSiteUrl={config.appUrl}>
              <Analytics measurementId={measurementId(config.analytics)}>{children}</Analytics>
            </SavedToolsProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
