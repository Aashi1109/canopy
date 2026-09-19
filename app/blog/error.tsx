"use client";

import { Button, ContentState } from "@/components/ui/index.tsx";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <ContentState
        state="error"
        density="page"
        headingLevel="h1"
        title="Couldn’t load the blog"
        description="The blog is temporarily unavailable. Try again in a moment."
        action={
          <div className="flex flex-wrap gap-3">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <a href="/blog">Back to the blog</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
