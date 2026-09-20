/** Shared URL validation for article rendering and browser editor controls. */
export function safeLink(input: unknown): string {
  if (
    typeof input !== "string" ||
    !input.isWellFormed() ||
    input.length > 2048 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input)
  )
    throw new Error("Link URL must be text of at most 2048 characters without control characters.");
  const href = input.trim();
  if (!href || /[\u0000-\u0020\u007f\\]/u.test(href)) throw new Error("Link URL contains unsafe characters.");
  if (/^\/(?!\/)/.test(href) || href.startsWith("#")) return href;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new Error("Link URL is invalid.");
  }
  if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Link URL uses an unsafe protocol or credentials.");
  return url.href;
}
