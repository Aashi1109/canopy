/**
 * Per-tool SEO metadata, generalised from the one hand-written
 * `generateMetadata` the repo had.
 *
 * `metadataBase` stays where it is (the app layouts), so the relative URLs
 * below resolve to absolute ones, and the layout `title.template` still
 * decorates `title` — which is why `title` here is the bare tool title and the
 * Open Graph title, which templates do not touch, carries the suffix itself.
 */

import type { Metadata, ResolvingMetadata } from "next";

import { resolveToolPage, type CatalogTool } from "./catalog";
import type { ToolApp } from "./categories";
import { toolFaviconHref } from "./icons";
import { defaultLocale, isLocale, localizeHref } from "../i18n/config";

function toolMetadataFor(tool: CatalogTool, parent: Awaited<ResolvingMetadata>): Metadata {
  return {
    title: tool.seoTitle,
    description: tool.seoDescription,
    keywords: [...tool.keywords],
    alternates: {
      canonical: tool.href,
      languages: Object.fromEntries(tool.availableLocales.map((locale) => [locale, localizeHref(tool.href, locale)])),
    },
    icons: { icon: toolFaviconHref(tool.icon) },
    openGraph: {
      title: `${tool.seoTitle} | SmartTools`,
      description: tool.seoDescription,
      type: "website",
      url: tool.href,
      images: parent.openGraph?.images,
    },
  };
}

export type ToolMetadataArgs = { params: Promise<{ slug: string; locale?: string }> };

/** Builds the `generateMetadata` export for an app's `[slug]` route. */
export function toolMetadata(app: ToolApp): (args: ToolMetadataArgs, parent: ResolvingMetadata) => Promise<Metadata> {
  return async function generateMetadata({ params }: ToolMetadataArgs, parent: ResolvingMetadata): Promise<Metadata> {
    const { slug, locale = defaultLocale } = await params;
    if (!isLocale(locale)) return { robots: { index: false } };
    const tool = await resolveToolPage(app, slug, locale);
    if (!tool) return { title: "Tool not found", robots: { index: false } };
    return toolMetadataFor(tool, await parent);
  };
}
