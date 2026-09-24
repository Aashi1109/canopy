/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time (`--webpack`) with the precache manifest: every
    // `_next/static` chunk (JS, web-worker bundles, jsquash/pdfjs/bcrypt wasm)
    // plus globbed `public/` assets including `/media/vendor/qpdf/*`.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Tools that call a live network service can never work offline. Their requests
// bypass the cache entirely so a lost connection fails loudly (surfaced to the
// user by the in-app "needs internet" dialog) instead of returning stale data.
const networkOnly: RuntimeCaching = {
  matcher: ({ url, sameOrigin }) => !sameOrigin || url.pathname.startsWith("/api/"),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [networkOnly, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
