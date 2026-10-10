export const DESIGNER_ZOOM = { initial: 0.85, min: 0.4, max: 4, step: 0.1 } as const;

export function clampDesignerZoom(next: number): number {
  if (!Number.isFinite(next)) return DESIGNER_ZOOM.initial;
  return Math.round(Math.min(DESIGNER_ZOOM.max, Math.max(DESIGNER_ZOOM.min, next)) * 100) / 100;
}

export function getCanvasPanSpace(
  viewport: { width: number; height: number },
  paper: { right: number; bottom: number },
): { gutterX: number; gutterY: number; width: number; height: number } {
  return {
    gutterX: viewport.width,
    gutterY: viewport.height,
    width: Math.ceil(Math.max(0, paper.right) + 2 * viewport.width),
    height: Math.ceil(Math.max(0, paper.bottom) + 2 * viewport.height),
  };
}

export function getHorizontalRevealDelta(
  node: { left: number; right: number },
  visible: { left: number; right: number },
): number {
  if (node.right - node.left > visible.right - visible.left) {
    const center = (node.left + node.right) / 2;
    // Oversized fields cannot show both edges; retain a visible center across repeated reveals.
    return center < visible.left || center > visible.right ? center - (visible.left + visible.right) / 2 : 0;
  }
  if (node.left < visible.left) return node.left - visible.left;
  if (node.right > visible.right) return node.right - visible.right;
  return 0;
}
