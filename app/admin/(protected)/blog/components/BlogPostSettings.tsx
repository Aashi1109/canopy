"use client";
import { appHref } from "@/lib/routing/subdomains.ts";
import assistantStyles from "@/components/assistant/Assistant.module.css";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
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
} from "@/components/ui/index.tsx";
import styles from "./BlogEditor.module.css";

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
  categories,
  tags,
  tools,
  disabled = false,
  categoryError,
  taxonomyHref = appHref("/admin/blog/taxonomy"),
  defaultTab = "post",
  categoryPagination,
  tagPagination,
}: BlogPostSettingsProps) {
  const [toolSearch, setToolSearch] = useState("");
  const filteredTools = filterRelatedTools(tools, toolSearch);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Tabs defaultValue={defaultTab} className="min-h-0 flex-1 gap-2.5">
        <TabsList className={assistantStyles.assistantTabs} aria-label="Post settings">
          <TabsTrigger className="flex-none" value="post">
            Post
          </TabsTrigger>
          <TabsTrigger className="flex-none" value="seo">
            SEO
          </TabsTrigger>
          <TabsTrigger className="flex-none" value="links">
            Related tools
          </TabsTrigger>
        </TabsList>
        <TabsContent value="post" className="min-h-0 space-y-5 overflow-y-auto overscroll-contain py-2">
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
                      tagIds: checked === true ? [...value.tagIds, tag.id] : value.tagIds.filter((id) => id !== tag.id),
                    })
                  }
                />
              ))
            )}
            <p className="text-xs text-muted-foreground">{value.tagIds.length} of 20 tags selected</p>
            {tagPagination}
          </fieldset>
        </TabsContent>
        <TabsContent value="seo" className="min-h-0 space-y-5 overflow-y-auto overscroll-contain py-2">
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
        <TabsContent value="links" className="min-h-0 space-y-4 overflow-y-auto overscroll-contain py-2">
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
                disabled={!value.relatedToolIds.includes(tool.id) && value.relatedToolIds.length >= 12}
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
            <p className="text-xs text-muted-foreground">{value.relatedToolIds.length} of 12 tools selected</p>
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
    </div>
  );
}
