import { z } from "zod";

const slug = z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional();
const cursor = z.string().max(1200).optional();
const filters = z.object({
  search: z.string().max(200).refine(value => value.isWellFormed() && !value.includes("\u0000")).optional(),
  category: slug,
  tag: slug,
  cursor,
  categoryCursor: cursor,
});

export type BlogFilters = z.infer<typeof filters>;

export function parseBlogFilters(params: Record<string, string | string[] | undefined>): BlogFilters {
  return filters.parse(Object.fromEntries(Object.keys(filters.shape).map(key => {
    const value = params[key];
    return [key, typeof value === "string" ? value.trim() || undefined : value];
  })));
}

export function blogListingHref(current: BlogFilters, changes: Partial<BlogFilters> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value) query.set(key, value);
  }
  return `/blog${query.size ? `?${query}` : ""}`;
}
