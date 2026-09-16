"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, CircleHelp, Search } from "lucide-react";
import {
  AlertBanner,
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToolActionButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@smarttools/ui";

export interface BlogSettingsValue {
  authorName: string;
  categoryId: string;
  tagIds: string[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  relatedToolIds: string[];
}

interface BlogPostSettingsProps {
  value: BlogSettingsValue;
  onChange: (value: BlogSettingsValue) => void;
  slug: string | null;
  categories: readonly { id: string; name: string }[];
  tags: readonly { id: string; name: string }[];
  tools: readonly { id: string; name: string }[];
  disabled?: boolean;
  categoryError?: string;
  taxonomyHref?: string;
  defaultTab?: "post" | "seo";
  categoryPagination?: ReactNode;
  tagPagination?: ReactNode;
}

export function filterRelatedTools(tools: BlogPostSettingsProps["tools"], query: string) {
  const search = query.trim().toLowerCase();
  return tools.filter((tool) => tool.name.toLowerCase().includes(search));
}

export function BlogPostSettings({
  value,
  onChange,
  slug,
  categories,
  tags,
  tools,
  disabled = false,
  categoryError,
  taxonomyHref = "/admin/blog/taxonomy",
  defaultTab = "post",
  categoryPagination,
  tagPagination,
}: BlogPostSettingsProps) {
  const [toolSearch, setToolSearch] = useState("");
  const [copyResult, setCopyResult] = useState<{
    slug: string;
    url: string;
    failed: boolean;
  } | null>(null);
  const result = copyResult?.slug === slug ? copyResult : null;
  const filteredTools = filterRelatedTools(tools, toolSearch);

  async function copyPostUrl() {
    if (!slug) return;
    const url = new URL(`/blog/${slug}`, window.location.origin).href;
    setCopyResult(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopyResult({ slug, url, failed: false });
    } catch {
      setCopyResult({ slug, url, failed: true });
    }
  }
  return (
    <div className="space-y-5">
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-5 w-full">
          <TabsTrigger className="px-2.5 py-2 text-[13px]" value="post">
            Post
          </TabsTrigger>
          <TabsTrigger className="px-2.5 py-2 text-[13px]" value="seo">
            SEO
          </TabsTrigger>
          <TabsTrigger className="px-2.5 py-2 text-[13px]" value="links">
            Related tools
          </TabsTrigger>
        </TabsList>
        <TabsContent value="post" className="space-y-5">
          <div className="grid gap-2" role="group" aria-labelledby="blog-post-url-label">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex shrink-0 items-center">
                <span
                  id="blog-post-url-label"
                  className="text-[13px] font-medium text-muted-foreground"
                >
                  Post URL
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label="About the post URL"
                    >
                      <CircleHelp aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Set when created. Changing the title won’t change this URL.
                  </TooltipContent>
                </Tooltip>
              </div>
              {slug ? (
                <>
                  <p className="min-w-0 flex-1 select-text break-all text-[13px]">
                    {result?.failed ? result.url : `/blog/${slug}`}
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToolActionButton
                        action="copy"
                        iconOnly
                        icon={result && !result.failed ? <Check aria-hidden="true" /> : undefined}
                        onClick={copyPostUrl}
                      >
                        Copy URL
                      </ToolActionButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      {result && !result.failed ? "Copied" : "Copy URL"}
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Assigned when the post is created.</p>
              )}
            </div>
            <p role="status" className={result?.failed ? "text-xs text-destructive" : "sr-only"}>
              {result
                ? result.failed
                  ? "Couldn’t copy. Select the full URL above and copy it manually, or try again."
                  : "URL copied."
                : ""}
            </p>
          </div>
          <div className="grid gap-2">
            <Label className="text-[13px]" htmlFor="blog-author">
              Author *
            </Label>
            <Input
              size="sm"
              id="blog-author"
              maxLength={150}
              value={value.authorName}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, authorName: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-[13px]" htmlFor="blog-post-category">
              Category *
            </Label>
            <Select
              disabled={disabled || categories.length === 0}
              value={value.categoryId || "none"}
              onValueChange={(categoryId) =>
                onChange({ ...value, categoryId: categoryId === "none" ? "" : categoryId })
              }
            >
              <SelectTrigger
                size="sm"
                id="blog-post-category"
                className="w-full"
                aria-invalid={!!categoryError}
                aria-describedby={categoryError ? "blog-category-error" : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="text-[13px]" value="none">
                  Choose a category
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem className="text-[13px]" key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryPagination}
            {categoryError && (
              <p id="blog-category-error" role="alert" className="text-xs text-destructive">
                {categoryError}
              </p>
            )}
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground">Create a category before publishing.</p>
            )}
            {!disabled && (
              <Link href={taxonomyHref} className="w-fit text-xs text-primary hover:underline">
                Manage categories & tags
              </Link>
            )}
          </div>
          <div className="grid gap-2">
            <Label className="text-[13px]" htmlFor="blog-excerpt">
              Excerpt
            </Label>
            <Textarea
              className="min-h-[72px] px-3 py-2 text-[13px]"
              id="blog-excerpt"
              maxLength={500}
              rows={4}
              value={value.excerpt}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, excerpt: event.target.value })}
            />
          </div>
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="mb-2 text-[13px] font-medium">
              Tags <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tags have been created yet.</p>
            ) : (
              tags.map((tag) => (
                <Checkbox
                  className="min-h-8 gap-2 text-[13px] [&_[data-slot=checkbox]]:size-4"
                  key={tag.id}
                  label={tag.name}
                  checked={value.tagIds.includes(tag.id)}
                  disabled={!value.tagIds.includes(tag.id) && value.tagIds.length >= 20}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...value,
                      tagIds:
                        checked === true
                          ? [...value.tagIds, tag.id]
                          : value.tagIds.filter((id) => id !== tag.id),
                    })
                  }
                />
              ))
            )}
            <p className="text-xs text-muted-foreground">
              {value.tagIds.length} of 20 tags selected
            </p>
            {tagPagination}
          </fieldset>
        </TabsContent>
        <TabsContent value="seo" className="space-y-5">
          <div className="grid gap-2">
            <Label className="text-[13px]" htmlFor="blog-seo-title">
              Search title
            </Label>
            <Input
              size="sm"
              id="blog-seo-title"
              maxLength={160}
              placeholder="Uses the article title by default"
              value={value.seoTitle}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, seoTitle: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-[13px]" htmlFor="blog-seo-description">
              Search description
            </Label>
            <Textarea
              className="min-h-[72px] px-3 py-2 text-[13px]"
              id="blog-seo-description"
              maxLength={320}
              placeholder="Uses the excerpt by default"
              rows={4}
              value={value.seoDescription}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, seoDescription: event.target.value })}
            />
          </div>
        </TabsContent>
        <TabsContent value="links" className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Optional links to SmartTools. General articles don’t need a related tool.
          </p>
          <Input
            size="sm"
            type="search"
            aria-label="Search related tools"
            placeholder="Search tools…"
            leadingIcon={<Search />}
            value={toolSearch}
            onChange={(event) => setToolSearch(event.target.value)}
          />
          <p role="status" className="text-xs text-muted-foreground">
            {filteredTools.length} {filteredTools.length === 1 ? "tool" : "tools"} found
          </p>
          <fieldset disabled={disabled} className="space-y-3">
            <legend className="sr-only">Related tools</legend>
            {filteredTools.map((tool) => (
              <Checkbox
                className="min-h-8 gap-2 text-[13px] [&_[data-slot=checkbox]]:size-4"
                key={tool.id}
                label={tool.name}
                checked={value.relatedToolIds.includes(tool.id)}
                disabled={
                  !value.relatedToolIds.includes(tool.id) && value.relatedToolIds.length >= 12
                }
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    relatedToolIds:
                      checked === true
                        ? [...value.relatedToolIds, tool.id]
                        : value.relatedToolIds.filter((id) => id !== tool.id),
                  })
                }
              />
            ))}
            <p className="text-xs text-muted-foreground">
              {value.relatedToolIds.length} of 12 tools selected
            </p>
            {filteredTools.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                {tools.length === 0
                  ? "No tools available."
                  : "No matching tools. Try a different name or clear your search."}
              </p>
            )}
          </fieldset>
        </TabsContent>
      </Tabs>
      <AlertBanner title="Only admins can see this draft">
        Preview is private. Publishing makes this saved revision available to everyone.
      </AlertBanner>
    </div>
  );
}
