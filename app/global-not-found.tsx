import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found | SmartTools",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-background font-sans text-foreground">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p>This page may have moved or is no longer available.</p>
          <a href="/" className="underline underline-offset-4">
            Explore SmartTools
          </a>
        </main>
      </body>
    </html>
  );
}
