import { appHref } from "../../../../lib/routing/subdomains.ts";

export function paginateAdminItems<T>(items: readonly T[], value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const requested = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / 25));
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const offset = (page - 1) * 25;
  return {
    items: items.slice(offset, offset + 25),
    page,
    pageCount,
    total: items.length,
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + 25, items.length),
  };
}

export function adminPageHref(path: string, page: number, filters: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return appHref(query ? `${path}?${query}` : path);
}
