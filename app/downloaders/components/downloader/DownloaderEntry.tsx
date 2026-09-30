"use client";

import { useId, useRef } from "react";
import { Download, Link, X } from "lucide-react";
import { Button } from "@/components/ui/components/button";
import { Input } from "@/components/ui/components/input";
import { Label } from "@/components/ui/components/label";
import { HowItWorks } from "@/components/ui/components/patterns";

export interface DownloaderEntryProps {
  platformName: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onInspect: () => boolean;
  error?: string;
  disabled?: boolean;
  busy?: boolean;
  inputDisabled?: boolean;
}

export function DownloaderEntry({
  platformName,
  value,
  onChange,
  onBlur,
  onInspect,
  error,
  disabled = false,
  busy = false,
  inputDisabled = false,
}: DownloaderEntryProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const unavailable = disabled || busy;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="overflow-hidden rounded-xl border border-border bg-card md:grid md:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]"
    >
      <aside
        className="hidden flex-col gap-6 bg-surface-ink p-8 text-on-ink md:flex"
        aria-label="How to copy a video link"
      >
        <h2 className="text-2xl font-semibold leading-snug">
          From your feed.
          <br />
          To your device.
        </h2>
        <div className="flex items-center gap-4">
          <img
            src="/downloaders/guide.webp"
            alt=""
            width={68}
            height={120}
            loading="lazy"
            className="h-[120px] w-[68px] shrink-0 rounded-lg object-cover"
          />
          <div className="space-y-2 text-sm leading-relaxed">
            <p>Open a public video on {platformName}.</p>
            <p className="font-semibold">Share → Copy link</p>
            <p className="text-on-ink-muted">Paste it into the field.</p>
          </div>
        </div>
        <p className="text-xs text-on-ink-muted">Illustrative guide · No video loaded</p>
        <p className="text-sm leading-relaxed text-on-ink-muted">
          Public videos only. No private or login-only content.
        </p>
      </aside>
      <form
        noValidate
        aria-busy={busy}
        className="flex min-w-0 flex-col justify-center gap-6 p-5 md:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (!unavailable && !onInspect()) input.current?.focus();
        }}
      >
        <div className="space-y-2">
          <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
            Found something worth saving?
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Start with a public {platformName} video link.
          </p>
        </div>
        <div className="space-y-2 rounded-lg bg-muted p-4">
          <Label htmlFor={`${id}-url`}>Public {platformName} link</Label>
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start">
            <div className="relative min-w-0 flex-1">
              <Input
                ref={input}
                id={`${id}-url`}
                name="videoUrl"
                type="url"
                required
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                size="md"
                className="pr-12 text-base md:text-sm"
                leadingIcon={<Link aria-hidden="true" />}
                placeholder={`Paste a ${platformName} video link`}
                value={value}
                disabled={unavailable || inputDisabled}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-feedback ${id}-quality`}
              />
              {value.length > 0 && (
                <Button
                  aria-label="Clear link"
                  variant="input-icon"
                  size="icon-md"
                  className="absolute right-0 top-0"
                  disabled={unavailable || inputDisabled}
                  onClick={() => {
                    onChange("");
                    input.current?.focus();
                  }}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
            <Button size="md" type="submit" disabled={unavailable} loading={busy}>
              <Download aria-hidden="true" />
              Download
            </Button>
          </div>
          <p
            id={`${id}-feedback`}
            aria-live="polite"
            aria-atomic="true"
            className={`text-sm leading-relaxed ${error ? "text-validation" : "text-muted-foreground"}`}
          >
            {error || "Copy the video’s link, then paste it into this field."}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1 text-sm leading-relaxed text-muted-foreground">
            <p id={`${id}-quality`}>
              Check the available formats up to 1080p, then choose the resolution and file type you want.
            </p>
            <p>Only download videos you own or have permission to save.</p>
          </div>
        </div>
      </form>
      <HowItWorks
        className="rounded-none border-x-0 border-b-0 md:col-span-2"
        steps={[
          { title: "Paste a link", description: "Use the video’s public share link." },
          { title: "Choose a format", description: "Compare the available resolution, size and audio." },
          { title: "Save your file", description: "Download before access expires." },
        ]}
      />
    </section>
  );
}
