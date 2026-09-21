import { InMemoryCache } from "../cache/inMemoryCache.ts";
import type { CatalogTool, PublicTool } from "./catalog.ts";
import type { ResolvedTool } from "../tool-catalog/index.ts";

type CatalogCache = InMemoryCache<
  string,
  {
    tools: readonly CatalogTool[];
    paperworkTools: Array<ResolvedTool & { slug: string }>;
    publicTools: readonly PublicTool[];
  }
>;

// Like db/runtime.ts, share state across separately bundled server modules.
const cacheKey = Symbol.for("canopy.public-catalog");
const runtime = globalThis as typeof globalThis & { [cacheKey]?: CatalogCache };

// ponytail: process-local; use shared invalidation if edits must reach every instance before TTL expiry.
export const catalogCache = (runtime[cacheKey] ??= new InMemoryCache());
