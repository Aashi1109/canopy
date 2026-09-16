/**
 * Per-tool SEO metadata, generalised from the one hand-written
 * `generateMetadata` the repo had.
 *
 * `metadataBase` stays where it is (the app layouts), so the relative URLs
 * below resolve to absolute ones, and the layout `title.template` still
 * decorates `title` — which is why `title` here is the bare tool title and the
 * Open Graph title, which templates do not touch, carries the suffix itself.
 */

import type { Metadata } from "next";

import { resolveToolPage, type CatalogTool } from "./catalog";
import type { ToolApp } from "./categories";
import type { ResolvedIcon } from "./icons";

/**
 * Product suffix for Open Graph titles. Mirrors each app layout's
 * `title.template`, which Next does not apply to Open Graph.
 */
const APP_SUFFIX: Readonly<Record<ToolApp, string>> = {
  devtools: "SmartTools Devtools",
  media: "SmartTools Media Tools",
};

function iconHref(icon: ResolvedIcon): string {
  return icon.kind === "url" ? icon.url : `data:image/svg+xml,${encodeURIComponent(icon.svg)}`;
}

function toolMetadataFor(tool: CatalogTool, app: ToolApp): Metadata {
  return {
    title: tool.seoTitle,
    description: tool.seoDescription,
    keywords: [...tool.keywords],
    alternates: { canonical: tool.href },
    icons: { icon: iconHref(tool.icon) },
    openGraph: {
      title: `${tool.seoTitle} | ${APP_SUFFIX[app]}`,
      description: tool.seoDescription,
      type: "website",
      url: tool.href,
    },
  };
}

export type ToolMetadataArgs = { params: Promise<{ slug: string }> };

/** Builds the `generateMetadata` export for an app's `[slug]` route. */
export function toolMetadata(app: ToolApp): (args: ToolMetadataArgs) => Promise<Metadata> {
  return async function generateMetadata({ params }: ToolMetadataArgs): Promise<Metadata> {
    const { slug } = await params;
    const tool = await resolveToolPage(app, slug);
    if (!tool) return { title: "Tool not found", robots: { index: false } };
    return toolMetadataFor(tool, app);
  };
}
