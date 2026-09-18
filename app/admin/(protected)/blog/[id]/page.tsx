import config from "@/lib/config/config.ts";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/authorization/index.ts";
import { getUserAuthorization } from "@/lib/admin/index.ts";
import { requirePagePermission } from "@/lib/admin/access";
import { getBlogPost } from "@/lib/blog/queries";
import { getTools } from "@/lib/tool-framework/catalog";
import { BlogEditor } from "../components/BlogEditor";
import { loadBlogTaxonomyOptions } from "../lib/loadBlogTaxonomyOptions";

export default async function BlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePagePermission("blog", "view");
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) notFound();
  const [post, categories, tags, authorization, tools] = await Promise.all([
    getBlogPost(session.user.id, id),
    loadBlogTaxonomyOptions(session.user.id, "category"),
    loadBlogTaxonomyOptions(session.user.id, "tag"),
    getUserAuthorization(session.user.id),
    getTools(),
  ]);
  if (!post) notFound();
  return (
    <BlogEditor
      key={`${post.id}:${post.version}`}
      actorId={session.user.id}
      post={post}
      categories={categories}
      tags={tags}
      tools={tools.map((tool) => ({ id: tool.toolId, name: tool.name }))}
      canEdit={hasPermission(authorization.access, "blog", "edit")}
      canPublish={hasPermission(authorization.access, "blog", "publish")}
      canCreate={hasPermission(authorization.access, "blog", "create")}
      cloudName={config.cloudinary.cloudName?.trim() ?? ""}
    />
  );
}
