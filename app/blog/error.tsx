"use client";

import { Button, EmptyState } from "@smarttools/ui";

export default function BlogError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-2xl px-5 py-20"><EmptyState headingLevel="h1" title="Couldn’t load the blog" description="The blog is temporarily unavailable. Try again in a moment." action={<div className="flex flex-wrap gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><a href="/blog">Back to the blog</a></Button></div>} /></div>;
}
