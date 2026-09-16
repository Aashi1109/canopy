import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const stateUrl = new URL("../app/admin/hooks/useAdminQueryState.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === stateUrl && specifier === "next/navigation") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export const useSearchParams = () => new URLSearchParams(window.location.search);
        `)}`,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { useAdminQueryState, updateAdminQuery } = await import(stateUrl);
hooks.deregister();

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
  t.after(() => {
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
  assert.equal(readState("app", "all", ["all", "paperwork", "devtools", "media"])[0], "media");
  assert.equal(readState("visibility", "all", ["all", "visible", "hidden"])[0], "hidden");
  assert.equal(readState("q", "")[0], "PDF & images");
  assert.equal(readState("section", "overview", ["overview", "content"])[0], "content");
  assert.equal(readState("category", "all")[0], "all");

  updateAdminQuery({ app: "unknown", visibility: "unknown", section: "unknown" });
  assert.equal(readState("app", "all", ["all", "media"])[0], "all");
  assert.equal(readState("visibility", "all", ["all", "visible", "hidden"])[0], "all");
  assert.equal(readState("section", "overview", ["overview", "content"])[0], "overview");
});

test("batched query updates preserve unspecified params and hash through history navigation", (t) => {
  const calls = browser(
    t,
    "/admin/tools?app=media&category=PDF&q=compress&visibility=hidden&ref=shared#catalog",
  );
  updateAdminQuery({ app: "devtools", category: null });
  assert.deepEqual(calls, ["push"]);
  assert.deepEqual(Object.fromEntries(window.location.searchParams), {
    app: "devtools",
    q: "compress",
    visibility: "hidden",
    ref: "shared",
  });
  assert.equal(window.location.pathname, "/admin/tools");
  assert.equal(window.location.hash, "#catalog");

  window.history.back();
  assert.equal(readState("app", "all")[0], "media");
  assert.equal(readState("category", "all")[0], "PDF");
  window.history.forward();
  assert.equal(readState("app", "all")[0], "devtools");
  assert.equal(readState("category", "all")[0], "all");
});

test("search replaces history, filters push history, and defaults remove their keys", (t) => {
  const calls = browser(t, "/admin/tools?ref=shared#catalog");
  const [, setQuery] = readState("q", "");
  const [, setVisibility] = readState("visibility", "all", ["all", "hidden"]);
  setQuery("PDF & images / 100%", true);
  setVisibility("hidden");
  assert.deepEqual(calls, ["replace", "push"]);
  assert.equal(readState("q", "")[0], "PDF & images / 100%");
  assert.equal(readState("visibility", "all")[0], "hidden");
  assert.equal(window.location.searchParams.get("ref"), "shared");

  setQuery("", true);
  assert.equal(window.location.searchParams.has("q"), false);
  setVisibility("all");
  assert.equal(window.location.searchParams.has("visibility"), false);
  assert.equal(window.location.hash, "#catalog");
});

test("reset clears catalog state together and unchanged state creates no history entry", (t) => {
  const calls = browser(
    t,
    "/admin/tools?q=PDF&app=media&category=PDF&visibility=draft&ref=shared#catalog",
  );
  const reset = { q: null, app: null, category: null, visibility: null };
  updateAdminQuery(reset);
  assert.equal(window.location.href, "https://smarttools.test/admin/tools?ref=shared#catalog");
  assert.deepEqual(calls, ["push"]);
  updateAdminQuery(reset);
  readState("q", "")[1]("", true);
  assert.deepEqual(calls, ["push"]);
});
