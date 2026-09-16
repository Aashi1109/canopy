import { requirePagePermission } from "@/lib/admin/access";
import { NewBlogPost } from "../components/NewBlogPost";

export default async function NewBlogPostPage() {
  await requirePagePermission("blog", "create");
  return <NewBlogPost />;
}
