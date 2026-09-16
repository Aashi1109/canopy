import type { ToolIconRow } from "@smarttools/database";
import { renderIdenticon } from "./identicon";

export type { ToolIconRow };

export type ResolvedIcon = { kind: "url"; url: string } | { kind: "svg"; svg: string };

function cloudName(): string | null {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim() || null;
}

export function toolIconUrl(row: ToolIconRow): string {
  const cloud = cloudName();
  if (!cloud) throw new Error("Cloudinary delivery is not configured");

  const publicId = row.publicId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `https://res.cloudinary.com/${encodeURIComponent(cloud)}/image/upload/f_png,c_fill,w_256,h_256,q_auto/v${encodeURIComponent(row.version)}/${publicId}.png`;
}

export function resolveIcon(toolId: string, name: string, row: ToolIconRow | null): ResolvedIcon {
  if (row && cloudName()) return { kind: "url", url: toolIconUrl(row) };
  return { kind: "svg", svg: renderIdenticon(toolId, name) };
}
