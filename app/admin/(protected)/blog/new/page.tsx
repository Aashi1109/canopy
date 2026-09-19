import { requirePagePermission } from "@/lib/admin/access";
import { NewBlogPost } from "../components/NewBlogPost";

export default async function NewBlogPostPage() {
  const session = await requirePagePermission("blog", "create");
  return <NewBlogPost key={session.user.id} userId={session.user.id} />;
}
