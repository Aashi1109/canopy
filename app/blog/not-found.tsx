import { BookOpen } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/index.tsx";

export default function BlogNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <EmptyState
        headingLevel="h1"
        icon={<BookOpen />}
        title="This story isn’t available"
        description="It may have moved or is no longer published. Find something useful in the blog."
        action={
          <Button asChild>
            <a href="/blog">Explore the blog</a>
          </Button>
        }
      />
    </div>
  );
}
