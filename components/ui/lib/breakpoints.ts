type Breakpoint = "compact" | "navigation";
type BreakpointRange = { min: Breakpoint; max?: Breakpoint } | { min?: Breakpoint; max: Breakpoint };

/** Read the same theme tokens that generate responsive CSS. Call from client effects. */
export function matchBreakpoint({ min, max }: BreakpointRange): MediaQueryList {
  const styles = window.getComputedStyle(document.documentElement);
  const value = (name: Breakpoint) => styles.getPropertyValue(`--breakpoint-${name}`).trim();
  const query = [min && `(width >= ${value(min)})`, max && `(width < ${value(max)})`].filter(Boolean).join(" and ");
  return window.matchMedia(query);
}
