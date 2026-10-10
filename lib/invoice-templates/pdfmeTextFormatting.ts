import type { Plugin } from "@pdfme/common";

export function supportsAdvancedTextBold(schema: { type?: unknown; textFormat?: unknown } | null | undefined): boolean {
  return schema?.type === "text" && (schema.textFormat === undefined || schema.textFormat === "plain");
}

/** Add whole-field bold without changing native text editing or stored bindings. */
export function withPdfmeTextFormatting(plugin: Plugin): Plugin {
  return {
    ...plugin,
    async ui(props) {
      await plugin.ui(props);
      if (!supportsAdvancedTextBold(props.schema) || props.schema.fontWeight !== "bold") return;

      const text = props.rootElement.querySelector<HTMLElement>('div[id^="text-"]');
      if (text) {
        text.style.fontWeight = "800";
        text.style.textShadow = "0.025em 0 0 currentColor";
      }
    },
    async pdf(props) {
      if (!supportsAdvancedTextBold(props.schema) || props.schema.fontWeight !== "bold" || !props.value) {
        return plugin.pdf(props);
      }

      const { escapeInlineMarkdown } = await import("@pdfme/schemas/utils");
      const variants = props.schema.fontVariants;
      const fontVariants = variants && typeof variants === "object" && !Array.isArray(variants) ? { ...variants } : {};
      delete (fontVariants as { bold?: unknown }).bold;

      // The generator already resolved bound input into value; readOnly is render-local.
      return plugin.pdf({
        ...props,
        value: `**${escapeInlineMarkdown(props.value)}**`,
        schema: {
          ...props.schema,
          readOnly: true,
          textFormat: "inline-markdown",
          fontVariantFallback: "synthetic",
          fontVariants,
        },
      });
    },
  };
}
