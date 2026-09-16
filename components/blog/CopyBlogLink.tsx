"use client";

import { useRef, useState } from "react";
import { Button, Input, Label } from "@smarttools/ui";

export function CopyBlogLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const input = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("manual");
    }
  }
  return (
    <div className="max-w-full">
      <Button
        variant="ghost"
        onClick={() => {
          void copy();
        }}
      >
        {status === "copied" ? "Link copied" : label}
      </Button>
      <span role="status" className="sr-only">
        {status === "copied"
          ? "Link copied. Paste it to share this story."
          : status === "manual"
            ? "Copy is unavailable. Select and copy the link below."
            : ""}
      </span>
      {status === "manual" && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">Copy is unavailable. Select the link and copy it manually.</p>
          <Label>
            Article link
            <Input ref={input} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              input.current?.focus();
              input.current?.select();
            }}
          >
            Select link
          </Button>
        </div>
      )}
    </div>
  );
}
