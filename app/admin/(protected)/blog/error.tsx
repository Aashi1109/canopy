"use client";

import Link from "next/link";
import { AlertBanner, Button } from "@/components/ui/index.tsx";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <AlertBanner variant="error" title="Couldn’t load this blog view">
        The request may contain an invalid filter, or the service may be unavailable. Try again or return to all posts.
      </AlertBanner>
      <div className="mt-4 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/admin/blog">All posts</Link>
        </Button>
      </div>
    </div>
  );
}
