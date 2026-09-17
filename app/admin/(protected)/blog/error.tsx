"use client";

import Link from "next/link";
import { AlertBanner, Button } from "@canopy/ui";

export default function BlogError({ reset }: { reset: () => void }) {
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
