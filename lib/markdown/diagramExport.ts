/** Rasterize the already-rendered, strict-security Mermaid SVG. */
export async function diagramPng(svg: string): Promise<Blob> {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = document.querySelector("svg");
  if (!root || (root as Element) !== document.documentElement || document.querySelector("parsererror")) {
    throw new Error("The diagram SVG could not be read.");
  }
  const bounds = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !bounds ||
    bounds.length !== 4 ||
    !bounds.every(Number.isFinite) ||
    bounds[2] <= 0 ||
    bounds[3] <= 0 ||
    bounds[2] > Number.MAX_SAFE_INTEGER ||
    bounds[3] > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("The diagram has invalid dimensions.");
  }
  const scale = Math.min(2, 8192 / bounds[2], 8192 / bounds[3], Math.sqrt(16_000_000 / (bounds[2] * bounds[3])));
  const width = Math.max(1, Math.floor(bounds[2] * scale));
  const height = Math.max(1, Math.floor(bounds[3] * scale));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  for (const property of ["width", "height", "max-width", "max-height"]) root.style.removeProperty(property);

  const image = new Image();
  // A data URI keeps foreignObject labels readable without tainting Chromium's canvas.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
  await image.decode();
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG export is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be created."))), "image/png");
  });
}
