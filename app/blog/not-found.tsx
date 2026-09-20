import { BookOpen } from "lucide-react";
import { Button, ContentState } from "@/components/ui/index.tsx";

export default function BlogNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-8">
      <ContentState
        className="flex-1"
        state="unavailable"
        density="page"
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
