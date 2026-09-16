import "server-only";

import { listBlogTaxonomy } from "@/lib/blog/queries";

/** Load one page; client controls explicitly fetch more instead of blocking on the whole catalog. */
export async function loadBlogTaxonomyOptions(actorId: string, kind: "category" | "tag") {
  const page = await listBlogTaxonomy(actorId, kind);
  return { items: page.items.map(({ id, name }) => ({ id, name })), nextCursor: page.nextCursor };
}
