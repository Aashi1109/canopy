import type { ToolIconRow } from "@canopy/database";
import { renderIdenticon } from "./identicon";

export type { ToolIconRow };

export type ResolvedIcon = { kind: "url"; url: string } | { kind: "svg"; svg: string };

function cloudName(): string | null {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || null;
}

export function toolIconUrl(row: Pick<ToolIconRow, "publicId" | "version">): string {
  const cloud = cloudName();
  if (!cloud) throw new Error("Cloudinary delivery is not configured");

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

export function resolveIcon(toolId: string, name: string, row: ToolIconRow | null): ResolvedIcon {
  if (row && cloudName()) return { kind: "url", url: toolIconUrl(row) };
  return { kind: "svg", svg: renderIdenticon(toolId, name) };
}
