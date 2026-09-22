"use client";

import { appHref } from "@/lib/routing/subdomains.ts";
import Link from "next/link";
import { ContentState, Button } from "@/components/ui/index.tsx";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto p-6">
      <ContentState
        className="flex-1"
        state="error"
        density="page"
        headingLevel="h1"
        title="Couldn’t load this blog view"
        description="The request may contain an invalid filter, or the service may be unavailable. Try again or return to all posts."
        action={<Button onClick={reset}>Try again</Button>}
        secondaryAction={
          <Button asChild variant="outline">
            <Link href={appHref("/admin/blog")}>All posts</Link>
          </Button>
        }
      />
    </div>
  );
}
