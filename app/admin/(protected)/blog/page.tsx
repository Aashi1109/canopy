import { z } from "zod";
import config from "@/lib/config/config.ts";
import { hasPermission } from "@/lib/authorization/index.ts";
import { getUserAuthorization } from "@/lib/admin/index.ts";
import { requirePagePermission } from "@/lib/admin/access";
import { listBlogPosts } from "@/lib/blog/queries";
import { BlogPosts } from "./components/BlogPosts";
import { loadBlogTaxonomyOptions } from "./lib/loadBlogTaxonomyOptions";

const filtersSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["draft", "published", "scheduled", "trash"]).optional(),
  categoryId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  cursor: z.string().max(1200).optional(),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER - 1)
    .optional()
    .catch(undefined),
});

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission("blog", "view");
  const { page: requestedPage, ...filters } = filtersSchema.parse(await searchParams);
  const [page, categories, authorization] = await Promise.all([
    listBlogPosts(session.user.id, { ...filters, cursor: undefined, page: requestedPage ?? 1 }),
    loadBlogTaxonomyOptions(session.user.id, "category"),
    getUserAuthorization(session.user.id),
  ]);
  return (
    <BlogPosts
      key={JSON.stringify({ ...filters, page: page.page })}
      posts={page.items}
      publicBlogHref={new URL("/blog", config.appUrl).href}
      pagination={{ page: page.page, pageCount: page.pageCount, total: page.total }}
      categories={categories}
      filters={{ ...filters, cursor: undefined, page: page.page }}
      canManageTerms={hasPermission(authorization.access, "blog", "edit")}
      canCreate={hasPermission(authorization.access, "blog", "create")}
      canArchive={hasPermission(authorization.access, "blog", "archive")}
    />
  );
}
