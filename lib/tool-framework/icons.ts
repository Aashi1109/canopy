import { renderIdenticon } from "./identicon.ts";

export type ResolvedIcon = { kind: "url"; url: string } | { kind: "svg"; svg: string };

export function toolIconUrl(cloud: string, row: { publicId: string; version: string }): string {
  const publicId = row.publicId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/f_png,c_fill,w_256,h_256,q_auto/v${encodeURIComponent(row.version)}/${publicId}.png`;
}

export function toolFaviconHref(icon: ResolvedIcon): string {
  if (icon.kind === "svg") return `data:image/svg+xml,${encodeURIComponent(icon.svg)}`;
  // Keep the version and asset path; Chromium favicons cannot use CORS under media's COEP.
  const assetPath = new URL(icon.url).pathname.split("/").slice(5).join("/");
  return `/tool-icons/${assetPath}`;
}

export function resolveIcon(toolId: string, name: string, iconUrl: string | null): ResolvedIcon {
  if (iconUrl) return { kind: "url", url: iconUrl };
  return { kind: "svg", svg: renderIdenticon(toolId, name) };
}
