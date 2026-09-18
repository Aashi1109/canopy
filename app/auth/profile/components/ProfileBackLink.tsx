"use client";

import { TextLink, Button } from "@/components/ui/index.tsx";
import type { MouseEvent } from "react";
import { shouldUseBrowserBack } from "../../_lib/security";

export function ProfileBackLink({ fallbackHref }: { fallbackHref: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!shouldUseBrowserBack(fallbackHref, window.location.href, document.referrer, window.history.length, modified)) {
      return;
    }

    event.preventDefault();
    window.history.back();
  }

  return (
    <Button asChild size="sm" variant="ghost">
      <a aria-label="Back to previous page" href={fallbackHref} onClick={handleClick}>
        <span aria-hidden="true">←</span>
        Back
      </a>
    </Button>
  );
}
