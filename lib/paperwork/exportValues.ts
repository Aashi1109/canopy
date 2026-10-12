export function csvCell(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : '""';
  const text = value == null ? "" : String(value);
  const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function localDate(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
