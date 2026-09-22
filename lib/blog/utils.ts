import type { BlogImage } from "./document.ts";

export const BLOG_TITLE_WORD_LIMIT = 20;

export function blogTitleWordCount(title: string): number {
  return title.match(/\S+/gu)?.length ?? 0;
}

/** Responsive delivery for validated images; stored metadata and originals stay unchanged. */
export function blogImageDelivery(
  image: Pick<BlogImage, "publicId" | "version" | "format" | "width">,
  cloudName: string,
): { src: string; srcSet: string } {
  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) throw new Error("A configured Cloudinary cloud is required.");
  const maxWidth = Math.min(image.width, 2560);
  const widths = [320, 640, 960, 1280, 1920, 2560].filter((width) => width < maxWidth);
  widths.push(maxWidth);
  const asset = `v${image.version}/${image.publicId.split("/").map(encodeURIComponent).join("/")}.${image.format}`;
  const url = (width: number) =>
    `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_${width}/q_auto/f_auto/${asset}`;
  return {
    src: url(Math.min(image.width, 1280)),
    srcSet: widths.map((width) => `${url(width)} ${width}w`).join(", "),
  };
}
