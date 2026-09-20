import { parse } from "node-html-parser";

import { escapeHtml } from "../../lib/devtools/shared/text.ts";
import type { ToolLinkPreviewImage, ToolLinkPreviewRender } from "../../lib/tool-framework/result.ts";

function webUrl(value: string, base: string): string {
  if (!value || value.length > 2048) return "";
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function dimension(value: string): number | null {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 && size <= 100000 ? size : null;
}

/** Parse inert HTML; only bounded text and HTTP(S) metadata leave this boundary. */
export function parseMetadata(
  html: string,
  resolvedUrl: string,
): Pick<ToolLinkPreviewRender, "metadata" | "tags" | "checks"> {
  const document = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: true, style: true, noscript: true, pre: true },
  });
  const head = document.querySelector("head") ?? document;
  const base = webUrl(head.querySelector("base[href]")?.getAttribute("href") ?? "", resolvedUrl) || resolvedUrl;
  const values = new Map<string, string[]>();
  const tags: string[] = [];
  const title = head.querySelector("title")?.text.trim().slice(0, 2000) ?? "";
  if (title) tags.push(`<title>${escapeHtml(title)}</title>`);
  for (const element of head.querySelectorAll("meta").slice(0, 200)) {
    const attribute = element.hasAttribute("property") ? "property" : "name";
    const property = element.getAttribute(attribute)?.trim().toLowerCase() ?? "";
    if (!/^(?:og:[a-z\d_:.-]+|twitter:[a-z\d_:.-]+|description)$/.test(property)) continue;
    const value = (element.getAttribute("content") ?? "").trim().slice(0, 4096);
    values.set(property, [...(values.get(property) ?? []), value]);
    tags.push(`<meta ${attribute}="${property}" content="${escapeHtml(value)}">`);
  }
  const value = (key: string) => values.get(key)?.find(Boolean) ?? "";
  const canonicalElement = head
    .querySelectorAll("link[rel]")
    .find((element) => element.getAttribute("rel")?.toLowerCase().split(/\s+/).includes("canonical"));
  const canonical = canonicalElement?.getAttribute("href")?.trim().slice(0, 2048) ?? "";
  if (canonical) tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}">`);

  function image(prefix: "og" | "twitter"): ToolLinkPreviewImage | null {
    const source =
      prefix === "og"
        ? value("og:image:secure_url") || value("og:image") || value("og:image:url")
        : value("twitter:image") || value("twitter:image:src");
    const url = webUrl(source, base);
    return url
      ? {
          url,
          previewUrl: null,
          alt: value(`${prefix}:image:alt`),
          width: dimension(value(`${prefix}:image:width`)),
          height: dimension(value(`${prefix}:image:height`)),
        }
      : null;
  }

  const ogImage = image("og");
  const ogTitle = value("og:title");
  const ogDescription = value("og:description");
  const metadata: ToolLinkPreviewRender["metadata"] = {
    url: webUrl(value("og:url"), base) || webUrl(canonical, base) || resolvedUrl,
    title: ogTitle || title,
    description: ogDescription || value("description"),
    siteName: value("og:site_name") || new URL(resolvedUrl).hostname,
    image: ogImage,
    twitter: {
      card: value("twitter:card"),
      title: value("twitter:title") || ogTitle || title,
      description: value("twitter:description") || ogDescription || value("description"),
      image: image("twitter") || ogImage,
    },
  };
  const checks: ToolLinkPreviewRender["checks"][number][] = [
    {
      property: "og:title",
      level: ogTitle ? "ok" : title ? "warn" : "error",
      label: ogTitle ? "Open Graph title found" : title ? "Using the page title" : "No title found",
      detail:
        ogTitle ||
        (title ? "Add og:title to control the shared title explicitly." : "Add og:title or a document title."),
    },
    {
      property: "og:description",
      level: ogDescription ? "ok" : "warn",
      label: ogDescription ? "Open Graph description found" : "Open Graph description missing",
      detail:
        ogDescription ||
        (value("description")
          ? "The preview uses the standard meta description."
          : "Add og:description to explain the shared page."),
    },
    {
      property: "og:image",
      level: ogImage ? "ok" : "error",
      label: ogImage ? "Open Graph image found" : "Usable Open Graph image missing",
      detail: ogImage?.url ?? "Add an HTTP(S) og:image URL that social crawlers can access.",
    },
    {
      property: "og:url",
      level: webUrl(value("og:url"), base) ? "ok" : "warn",
      label:
        value("og:url") && webUrl(value("og:url"), base) ? "Open Graph URL found" : "Open Graph URL missing or invalid",
      detail: value("og:url") || "The preview uses the canonical URL or fetched page address.",
    },
    {
      property: "og:type",
      level: value("og:type") ? "ok" : "warn",
      label: value("og:type") ? "Open Graph type found" : "Open Graph type missing",
      detail: value("og:type") || 'Add og:type, usually "website" or "article".',
    },
    {
      property: "twitter:card",
      level: ["summary", "summary_large_image"].includes(value("twitter:card")) ? "ok" : "warn",
      label: ["summary", "summary_large_image"].includes(value("twitter:card"))
        ? "X card type found"
        : "X card type missing or unsupported",
      detail: value("twitter:card") || "Add twitter:card to choose a summary or large-image card.",
    },
  ];
  for (const [property, entries] of values) {
    if (entries.length > 1)
      checks.push({
        property,
        level: "warn",
        label: `Duplicate ${property} tags`,
        detail: `Found ${entries.length} values. This preview uses the first nonempty value; platforms may choose differently.`,
      });
  }
  if (ogImage && (!ogImage.width || !ogImage.height))
    checks.push({
      property: "og:image:dimensions",
      level: "warn",
      label: "Image dimensions not declared",
      detail:
        "Add og:image:width and og:image:height. Declared dimensions are not a measurement of the downloaded image.",
    });
  return { metadata, tags: tags.join("\n"), checks };
}
