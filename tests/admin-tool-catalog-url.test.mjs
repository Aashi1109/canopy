import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { useAdminQueryState, updateAdminQuery } = await import("@/app/admin/hooks/useAdminQueryState.ts");

function browser(t, path = "/admin/tools") {
  const previousWindow = globalThis.window;
  const entries = [new URL(path, "https://smarttools.test")];
  let index = 0;
  const calls = [];
  globalThis.window = {
    get location() {
      return entries[index];
    },
    history: {
      pushState(state, title, path) {
        calls.push("push");
        entries.splice(index + 1, entries.length, new URL(path, entries[index]));
        index++;
      },
      replaceState(state, title, path) {
        calls.push("replace");
        entries[index] = new URL(path, entries[index]);
      },
      back() {
        index = Math.max(0, index - 1);
      },
      forward() {
        index = Math.min(entries.length - 1, index + 1);
      },
    },
  };
  t.onTestFinished(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return calls;
}

function readState(key, defaultValue, allowedValues) {
  let state;
  function Consumer() {
    state = useAdminQueryState(key, defaultValue, allowedValues);
    return createElement("output", null, state[0]);
  }
  renderToStaticMarkup(createElement(Consumer));
  return state;
}

test("admin links restore allowed filters and fall back for missing or invalid values", (t) => {
  browser(t, "/admin/tools?app=media&visibility=hidden&q=PDF+%26+images&section=content");
  expect(readState("app", "all", ["all", "paperwork", "devtools", "media"])[0]).toBe("media");
  expect(readState("visibility", "all", ["all", "visible", "hidden"])[0]).toBe("hidden");
  expect(readState("q", "")[0]).toBe("PDF & images");
  expect(readState("section", "overview", ["overview", "content"])[0]).toBe("content");
  expect(readState("category", "all")[0]).toBe("all");

  updateAdminQuery({ app: "unknown", visibility: "unknown", section: "unknown" });
  expect(readState("app", "all", ["all", "media"])[0]).toBe("all");
  expect(readState("visibility", "all", ["all", "visible", "hidden"])[0]).toBe("all");
  expect(readState("section", "overview", ["overview", "content"])[0]).toBe("overview");
});

test("batched query updates preserve unspecified params and hash through history navigation", (t) => {
  const calls = browser(t, "/admin/tools?app=media&category=PDF&q=compress&visibility=hidden&ref=shared#catalog");
  updateAdminQuery({ app: "devtools", category: null });
  expect(calls).toEqual(["push"]);
  expect(Object.fromEntries(window.location.searchParams)).toEqual({
    app: "devtools",
    q: "compress",
    visibility: "hidden",
    ref: "shared",
  });
  expect(window.location.pathname).toBe("/admin/tools");
  expect(window.location.hash).toBe("#catalog");

  window.history.back();
  expect(readState("app", "all")[0]).toBe("media");
  expect(readState("category", "all")[0]).toBe("PDF");
  window.history.forward();
  expect(readState("app", "all")[0]).toBe("devtools");
  expect(readState("category", "all")[0]).toBe("all");
});

test("search replaces history, filters push history, and defaults remove their keys", (t) => {
  const calls = browser(t, "/admin/tools?ref=shared#catalog");
  const [, setQuery] = readState("q", "");
  const [, setVisibility] = readState("visibility", "all", ["all", "hidden"]);
  setQuery("PDF & images / 100%", true);
  setVisibility("hidden");
  expect(calls).toEqual(["replace", "push"]);
  expect(readState("q", "")[0]).toBe("PDF & images / 100%");
  expect(readState("visibility", "all")[0]).toBe("hidden");
  expect(window.location.searchParams.get("ref")).toBe("shared");

  setQuery("", true);
  expect(window.location.searchParams.has("q")).toBe(false);
  setVisibility("all");
  expect(window.location.searchParams.has("visibility")).toBe(false);
  expect(window.location.hash).toBe("#catalog");
});

test("reset clears catalog state together and unchanged state creates no history entry", (t) => {
  const calls = browser(t, "/admin/tools?q=PDF&app=media&category=PDF&visibility=draft&ref=shared#catalog");
  const reset = { q: null, app: null, category: null, visibility: null };
  updateAdminQuery(reset);
  expect(window.location.href).toBe("https://smarttools.test/admin/tools?ref=shared#catalog");
  expect(calls).toEqual(["push"]);
  updateAdminQuery(reset);
  readState("q", "")[1]("", true);
  expect(calls).toEqual(["push"]);
});
