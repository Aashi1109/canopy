"use client";

import { Button, Input, Label, Popover } from "@smarttools/ui";
import { Menu, Search } from "lucide-react";

export function BlogMobileNavigation({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full border border-input bg-card [&_svg]:size-5"
            aria-label="Search articles"
          >
            <Search aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={12}
            collisionPadding={16}
            aria-label="Search the blog"
            className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-lg"
          >
            <form action="/blog" method="get" role="search" className="space-y-3">
              <Label htmlFor="blog-mobile-search">Search articles</Label>
              <Input
                id="blog-mobile-search"
                name="search"
                type="search"
                maxLength={200}
                placeholder="Search articles…"
              />
              <Button type="submit" className="w-full">
                Search
              </Button>
            </form>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full border border-input bg-card [&_svg]:size-5"
            aria-label="Open navigation"
          >
            <Menu aria-hidden="true" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={12}
            collisionPadding={16}
            aria-label="SmartTools navigation"
            className="z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-2 shadow-lg"
          >
            <nav aria-label="Site navigation" className="flex flex-col gap-1">
              {[
                ["/", "All tools"],
                ["/paperwork", "Documents"],
                ["/devtools", "Developer"],
                ["/media", "Media"],
                ["/blog", "Blog"],
              ].map(([href, label]) => (
                <Button
                  asChild
                  key={href}
                  variant="ghost"
                  className="justify-start aria-[current=page]:bg-accent aria-[current=page]:text-primary"
                >
                  <a href={href} aria-current={href === "/blog" ? "page" : undefined}>
                    {label}
                  </a>
                </Button>
              ))}
              <div className="my-1 border-t border-border" />
              <Button asChild variant="ghost" className="justify-start">
                <a href={`${signedIn ? "/auth/profile" : "/auth"}?returnTo=%2Fblog`}>
                  {signedIn ? "My profile" : "Sign in"}
                </a>
              </Button>
              {isAdmin && (
                <Button asChild variant="ghost" className="justify-start">
                  <a href="/admin">Admin page</a>
                </Button>
              )}
            </nav>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
