import { z } from "zod";
import { hasPermission } from "@smarttools/authorization";
import { getUserAuthorization } from "@smarttools/control-plane";
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
});

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission("blog", "view");
  const filters = filtersSchema.parse(await searchParams);
  const [page, categories, authorization] = await Promise.all([
    listBlogPosts(session.user.id, filters),
    loadBlogTaxonomyOptions(session.user.id, "category"),
    getUserAuthorization(session.user.id),
  ]);
  return (
    <BlogPosts
      key={JSON.stringify(filters)}
      posts={page.items}
      nextCursor={page.nextCursor}
      categories={categories}
      filters={filters}
      canManageTerms={hasPermission(authorization.access, "blog", "edit")}
      canCreate={hasPermission(authorization.access, "blog", "create")}
      canArchive={hasPermission(authorization.access, "blog", "archive")}
    />
  );
}
