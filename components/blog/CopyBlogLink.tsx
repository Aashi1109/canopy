"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon, Mail, Share2 } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Popover,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from "@/components/ui/index.tsx";

export function CopyBlogLink({ url, title }: { url: string; title: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setOpen(false);
      timer.current = setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("manual");
      setOpen(true);
      toast.error("Couldn't copy the link. Select and copy it from the sharing menu.");
    }
  }

  async function share() {
    setSharing(true);
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setOpen(true);
        toast.error("Sharing is unavailable. Copy the link or share by email instead.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2" role="group" aria-label="Share article">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground max-sm:hidden"
              aria-label={status === "copied" ? "Link copied" : "Copy article link"}
              onClick={() => {
                void copy();
              }}
            >
              {status === "copied" ? (
                <Check aria-hidden="true" className="size-[18px]" />
              ) : (
                <LinkIcon aria-hidden="true" className="size-[18px]" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{status === "copied" ? "Link copied" : "Copy article link"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            className="h-10 gap-2 bg-muted px-3 text-[13px] font-medium text-foreground"
            disabled={sharing}
            onClick={(event) => {
              if (typeof navigator.share === "function") {
                event.preventDefault();
                void share();
              }
            }}
          >
            <Share2 aria-hidden="true" className="size-4 text-muted-foreground" />
            Share
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            aria-label="Share this article"
            className="z-50 w-72 max-w-[calc(100vw-32px)] rounded-lg border border-input bg-popover p-3 text-popover-foreground shadow-md"
          >
            {status === "manual" && (
              <div className="mb-3 space-y-2">
                <Label htmlFor="article-share-url">Select and copy this link</Label>
                <Input id="article-share-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start text-foreground"
              onClick={() => {
                void copy();
              }}
            >
              <LinkIcon aria-hidden="true" /> {status === "manual" ? "Retry copy" : "Copy link"}
            </Button>
            <Button asChild variant="ghost" className="w-full justify-start text-foreground">
              <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}>
                <Mail aria-hidden="true" /> Share by email
              </a>
            </Button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <span role="status" className="sr-only">
        {status === "copied"
          ? "Link copied. Paste it to share this story."
          : status === "manual"
            ? "Copy is unavailable. Select and copy the article link in the sharing menu."
            : ""}
      </span>
    </div>
  );
}
