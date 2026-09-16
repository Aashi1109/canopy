import { Node } from "@tiptap/core";
import { z } from "zod";
import type { BlogImage } from "@/lib/blog/document";

const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) =>
        value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    );
const imageAttributes = z
  .object({
    publicId: z
      .string()
      .regex(
        /^smarttools\/blog\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    format: z.enum(["jpg", "jpeg", "png", "webp"]),
    width: z.number().int().min(1).max(30000),
    height: z.number().int().min(1).max(30000),
    alt: safeText(500),
    caption: safeText(1000),
    displayWidth: z
      .number()
      .int()
      .min(10)
      .max(100)
      .nullish()
      .transform((value) => value ?? 100),
    alignment: z
      .enum(["left", "center", "right"])
      .nullish()
      .transform((value) => value ?? "center"),
  })
  .strict();

export function blogEditorImageSource(
  image: Pick<BlogImage, "publicId" | "version"> & { format: string },
  cloudName: string,
) {
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/v${image.version}/${image.publicId.split("/").map(encodeURIComponent).join("/")}.${encodeURIComponent(image.format)}`;
}

/** Uploaded assets remain structured image nodes when copied or cut between editor positions. */
export const BlogImageNode = Node.create<{
  cloudName: string;
  onUploadImage: (file: File) => Promise<BlogImage | null>;
}>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return { cloudName: "", onUploadImage: async () => null };
  },
  addAttributes() {
    const defaults = {
      publicId: "",
      version: 0,
      format: "png",
      width: 1,
      height: 1,
      alt: "",
      caption: "",
      displayWidth: 100,
      alignment: "center",
    };
    // The validated metadata is authoritative; raw figure attributes must not override it.
    return Object.fromEntries(
      Object.entries(defaults).map(([name, value]) => [
        name,
        { default: value, rendered: false, parseHTML: () => null },
      ]),
    );
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-blog-image]",
        getAttrs: (element) => {
          const metadata = element.getAttribute("data-blog-image");
          if (
            !metadata ||
            metadata.length > 6144 ||
            new TextEncoder().encode(metadata).length > 6144 ||
            !/^[a-zA-Z0-9_-]+$/.test(this.options.cloudName)
          )
            return false;
          try {
            const input: unknown = JSON.parse(metadata);
            if (input && typeof input === "object" && Object.hasOwn(input, "__proto__"))
              return false;
            const parsed = imageAttributes.safeParse(input);
            if (
              !parsed.success ||
              element.querySelector("img")?.getAttribute("src") !==
                blogEditorImageSource(parsed.data, this.options.cloudName)
            )
              return false;
            return parsed.data;
          } catch {
            return false;
          }
        },
      },
    ];
  },
  renderHTML({ node }) {
    const parsed = imageAttributes.safeParse(node.attrs);
    if (!parsed.success) return ["figure", {}];
    const attrs = parsed.data;
    return [
      "figure",
      {
        "data-blog-image": JSON.stringify(attrs),
        style: `width:${attrs.displayWidth}%;margin-left:${attrs.alignment === "left" ? "0" : "auto"};margin-right:${attrs.alignment === "right" ? "0" : "auto"}`,
      },
      [
        "img",
        {
          src: blogEditorImageSource(attrs, this.options.cloudName),
          alt: attrs.alt,
          width: attrs.width,
          height: attrs.height,
          style: "width:100%;height:auto",
        },
      ],
      ["figcaption", {}, attrs.caption],
    ];
  },
});
