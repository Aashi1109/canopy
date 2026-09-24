import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — SmartTools",
};

// Precached fallback shown when an uncached route is opened without a
// connection. Cached tool pages still load normally; this only covers routes
// the service worker has never seen.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-foreground">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use yet. Reconnect to open it, or head back to a tool you&apos;ve
        already visited — most tools keep working without a connection.
      </p>
      <a className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-primary" href="/devtools">
        Back to tools
      </a>
    </main>
  );
}
