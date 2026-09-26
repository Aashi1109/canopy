"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceInputState } from "@/components/ToolWorkspace";
import type { ToolLifecycle } from "@/lib/tool-runtime/types";
import type { ToolSpec } from "./spec";
import { decodeToolShare, encodeToolShare, MAX_SHARE_URL_LENGTH, type ToolShareState } from "./toolShare";

type ShareSnapshot = { input: WorkspaceInputState; settings: ToolShareState["settings"] };
type Options = ShareSnapshot & {
  spec: ToolSpec;
  lifecycle: ToolLifecycle;
  completed: ShareSnapshot | null;
  initialize: (state: ToolShareState | null) => void;
  run: () => void;
  onError: (message: string) => void;
};

const SHARE_DELAY_MS = 300;

function matches(state: ToolShareState, current: ShareSnapshot): boolean {
  return (
    current.input.files.length === 0 &&
    current.input.text === state.input.text &&
    (current.input.secondary ?? "") === (state.input.secondary ?? "") &&
    Object.keys(current.settings).length === Object.keys(state.settings).length &&
    Object.entries(state.settings).every(([key, value]) => Object.is(current.settings[key], value))
  );
}

/** Shares successful state only; URL writes never feed back into tool execution. */
export function useToolShare(options: Options) {
  const current = useRef(options);
  current.current = options;
  const observed = useRef<ShareSnapshot | null>(null);
  const changedAt = useRef(0);
  const active = useRef(false);
  const restoring = useRef<{ state: ToolShareState; shared: boolean; applied?: boolean } | null>(null);
  const lastHash = useRef("");
  const lastError = useRef("");
  const [url, setUrl] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    if (message === lastError.current) return;
    lastError.current = message;
    current.current.onError(message);
  }, []);

  const replaceHash = useCallback(
    (hash: string) => {
      const next = `${window.location.pathname}${window.location.search}${hash}`;
      try {
        if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", next);
        lastHash.current = hash;
        return true;
      } catch {
        notify("The browser could not update the share link. Your tool still works; try reloading the page.");
        return false;
      }
    },
    [notify],
  );

  const removeShare = useCallback(() => {
    if (window.location.hash.startsWith("#share=")) replaceHash("");
    setUrl(null);
  }, [replaceHash]);

  const defaults = useCallback(
    (): ToolShareState => ({
      input: { text: "" },
      settings: Object.fromEntries(
        Object.entries(current.current.spec.settings.fields).map(([key, field]) => [key, field.default]),
      ),
    }),
    [],
  );

  const clear = useCallback(() => {
    active.current = false;
    restoring.current = { state: defaults(), shared: false };
    lastError.current = "";
    removeShare();
  }, [defaults, removeShare]);

  useEffect(() => {
    if (!options.spec.sharing) return;
    observed.current = { input: current.current.input, settings: current.current.settings };
    const readLocation = (initial = false) => {
      const hash = window.location.hash;
      if (!initial && hash === lastHash.current) return;
      const previousHash = lastHash.current;
      lastHash.current = hash;
      const decoded =
        window.location.href.length > MAX_SHARE_URL_LENGTH && hash.startsWith("#share=")
          ? { error: "This share link is too large. Reset the tool and use a smaller input." }
          : decodeToolShare(current.current.spec, hash);
      if (!initial && decoded === null && (hash !== "" || !previousHash.startsWith("#share="))) return;
      active.current = decoded !== null && "state" in decoded;
      setUrl(null);
      if (decoded && "error" in decoded) {
        notify(decoded.error);
        removeShare();
      }
      const state = decoded && "state" in decoded ? decoded.state : null;
      restoring.current = state ? { state, shared: true } : initial ? null : { state: defaults(), shared: false };
      current.current.initialize(state);
    };
    readLocation(true);
    const navigate = () => readLocation();
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("popstate", navigate);
    };
  }, [options.spec, defaults, notify, removeShare]);

  useEffect(() => {
    if (!options.spec.sharing) return;
    const pending = restoring.current;
    if (pending && !matches(pending.state, options)) {
      if (!pending.applied) return;
      // Editing restored inputs cancels the pending automatic run and resumes normal sharing.
      restoring.current = null;
    } else if (pending) {
      pending.applied = true;
      if (pending.shared && options.spec.trigger.mode === "manual") {
        if (options.lifecycle !== "ready") return;
        // Parent runtime effects must evaluate the new input before a manual run starts.
        // Otherwise navigation from an already-ready form can cancel that new run.
        const timer = window.setTimeout(() => {
          const latest = current.current;
          if (restoring.current !== pending || !matches(pending.state, latest) || latest.lifecycle !== "ready") return;
          restoring.current = null;
          observed.current = { input: latest.input, settings: latest.settings };
          active.current = true;
          changedAt.current = Date.now() - SHARE_DELAY_MS;
          latest.run();
        }, 0);
        return () => window.clearTimeout(timer);
      }
      restoring.current = null;
      observed.current = { input: options.input, settings: options.settings };
      active.current = pending.shared;
      changedAt.current = Date.now() - SHARE_DELAY_MS;
    }
    const previous = observed.current;
    if (previous && (previous.input !== options.input || previous.settings !== options.settings)) {
      observed.current = { input: options.input, settings: options.settings };
      active.current = true;
      changedAt.current = Date.now();
      removeShare();
    }
    const ready =
      options.lifecycle === "completed" &&
      options.completed?.input === options.input &&
      options.completed.settings === options.settings &&
      options.input.files.length === 0;
    if (!ready) {
      if (options.lifecycle === "failed" || options.lifecycle === "invalid") removeShare();
      else setUrl(null);
      return;
    }
    if (!active.current) return;
    const timer = window.setTimeout(
      () => {
        const input: ToolShareState["input"] =
          options.input.secondary === undefined
            ? { text: options.input.text }
            : { text: options.input.text, secondary: options.input.secondary };
        const encoded = encodeToolShare(options.spec, { input, settings: options.settings });
        if ("error" in encoded) {
          removeShare();
          notify(encoded.error);
          return;
        }
        const nextUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${encoded.hash}`;
        if (nextUrl.length > MAX_SHARE_URL_LENGTH) {
          removeShare();
          notify("This input is too large to share as a link. Use a smaller input; your result is still available.");
          return;
        }
        if (replaceHash(encoded.hash)) {
          lastError.current = "";
          setUrl(nextUrl);
        }
      },
      Math.max(0, SHARE_DELAY_MS - (Date.now() - changedAt.current)),
    );
    return () => window.clearTimeout(timer);
  }, [
    options.spec,
    options.input,
    options.settings,
    options.completed,
    options.lifecycle,
    options.run,
    notify,
    removeShare,
    replaceHash,
  ]);

  return {
    clear,
    url,
    canCopy: Boolean(
      url &&
      options.lifecycle === "completed" &&
      options.completed?.input === options.input &&
      options.completed.settings === options.settings,
    ),
  };
}
