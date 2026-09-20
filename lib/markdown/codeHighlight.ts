import { common, createLowlight } from "lowlight";

export const codeLowlight = createLowlight(common);

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function highlightCode(code: string, language?: string | null): string {
  if (language === "mermaid") return escapeHtml(code);
  const tree =
    language && codeLowlight.registered(language)
      ? codeLowlight.highlight(language, code)
      : codeLowlight.highlightAuto(code);

  function render(node: (typeof tree.children)[number]): string {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type !== "element") return "";
    const content = node.children.map(render).join("");
    if (node.tagName !== "span") return content;
    const classes = Array.isArray(node.properties.className)
      ? node.properties.className.filter((value) => typeof value === "string" && /^[\w-]+$/.test(value)).join(" ")
      : "";
    return classes ? `<span class="${classes}">${content}</span>` : content;
  }

  return tree.children.map(render).join("");
}
