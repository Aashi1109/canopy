"use client";

import Link from "next/link";
import { ContentState, Button } from "@/components/ui/index.tsx";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <ContentState
        state="error"
        density="page"
        headingLevel="h1"
        title="Couldn’t load this blog view"
        description="The request may contain an invalid filter, or the service may be unavailable. Try again or return to all posts."
        action={<Button onClick={reset}>Try again</Button>}
        secondaryAction={
          <Button asChild variant="outline">
            <Link href="/admin/blog">All posts</Link>
          </Button>
        }
      />
    </div>
  );
}
