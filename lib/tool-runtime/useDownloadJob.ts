"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { PlatformId } from "@/lib/downloaders/contracts";
import { createDownloadJobController, isActiveDownload } from "./downloadJobClient";

/** The durable server job is independent of the mounted observer. */
export function useDownloadJob(platform: PlatformId) {
  const controller = useMemo(() => {
    let storage: Storage | undefined;
    try {
      if (typeof window !== "undefined") storage = window.sessionStorage;
    } catch {
      /* Private mode may deny storage. */
    }
    return createDownloadJobController({ platform, storage });
  }, [platform]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const failures = useRef(0);
  const delay = useRef(1500);
  const inspectionStartedAt = useRef(0);

  useEffect(() => {
    failures.current = 0;
    delay.current = 1500;
    void controller.resume();
    const reauthorize = () => {
      controller.stop(true);
      if (document.visibilityState !== "hidden") {
        failures.current = 0;
        delay.current = 1500;
        void controller.resume();
      }
    };
    document.addEventListener("visibilitychange", reauthorize);
    window.addEventListener("focus", reauthorize);
    window.addEventListener("online", reauthorize);
    return () => {
      document.removeEventListener("visibilitychange", reauthorize);
      window.removeEventListener("focus", reauthorize);
      window.removeEventListener("online", reauthorize);
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    // A new submission or a selected download starts its own polling cadence.
    failures.current = 0;
    delay.current = 1500;
    inspectionStartedAt.current = performance.now();
  }, [controller, state.job?.requestId, state.intent]);

  useEffect(() => {
    if (state.busy || document.visibilityState === "hidden" || !navigator.onLine) return;
    if (!isActiveDownload(state.job) && !state.recoverable) return;
    if (state.error && (!state.error.retryable || ++failures.current > 5)) return;
    if (!state.error) failures.current = 0;
    const inspecting = state.intent === "inspect" && !state.error;
    const inspectionDelay = performance.now() - inspectionStartedAt.current < 5000 ? 500 : 1000;
    const wait = inspecting ? inspectionDelay : Math.max(delay.current, (state.error?.retryAfterSeconds ?? 0) * 1000);
    const timer = window.setTimeout(
      () => {
        void controller.resume();
      },
      Math.min(wait, 2_147_483_647),
    );
    delay.current = inspecting ? 1500 : Math.min(15000, Math.round(delay.current * 1.5));
    return () => window.clearTimeout(timer);
  }, [controller, state]);

  return { ...state, controller };
}
