const EDITOR_FEATURES_FALLBACK_DELAY_MS = 200;

/** Keep optional editor imports off the page's initial load path. */
export function scheduleEditorFeatures(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let idleHandle: number | undefined;
  let timerHandle: number | undefined;

  const run = () => {
    idleHandle = undefined;
    timerHandle = undefined;
    if (!cancelled) callback();
  };
  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(run);
    } else {
      timerHandle = window.setTimeout(run, EDITOR_FEATURES_FALLBACK_DELAY_MS);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
    if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    if (timerHandle !== undefined) window.clearTimeout(timerHandle);
  };
}
