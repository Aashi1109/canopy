import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate, setTimeout as wait } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, errors: [], timer: { current: null } };
globalThis.__blogShareTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/CopyBlogLink.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(`
      export function useState(initial) { const s=globalThis.__blogShareTest; const i=s.index++; if (!(i in s.values)) s.values[i]=initial; return [s.values[i], value=>s.values[i]=value]; }
      export function useRef() { return globalThis.__blogShareTest.timer; }
      export function useEffect() {}
    `);
    if (specifier === "@/components/ui/index.tsx")
      return stub(`
      export const Button='button', Input='input', Label='label', Tooltip='tooltip', TooltipContent='tooltip-content', TooltipProvider='tooltip-provider', TooltipTrigger='tooltip-trigger';
      export const Popover={Root:'popover',Trigger:'popover-trigger',Portal:'portal',Content:'dialog'};
      export const toast={error(message){globalThis.__blogShareTest.errors.push(message);}};
    `);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/CopyBlogLink.tsx")) return next(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { CopyBlogLink } = await import("../components/blog/CopyBlogLink.tsx");
const walk = (node) =>
  Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const url = "https://example.com/blog/a-guide";
const title = "A guide & a better workflow";
const render = () => {
  state.index = 0;
  return walk(CopyBlogLink({ url, title }));
};
const copyButton = () =>
  render().find((n) => n.type === "button" && /Copy article link|Link copied/.test(n.props["aria-label"] ?? "")).props;
const shareButton = () =>
  render().find((n) => n.type === "button" && Array.isArray(n.props.children) && n.props.children.includes("Share"))
    .props;
const announcement = () => render().find((n) => n.props.role === "status").props.children;

test("article sharing copies the canonical URL, resets feedback, and recovers from clipboard and native-share failures", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  const navigator = {
    clipboard: {
      async writeText(value) {
        copied.push(value);
      },
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: navigator });
  t.after(() => {
    clearTimeout(state.timer.current);
    hooks.deregister();
    delete globalThis.__blogShareTest;
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });
  copyButton().onClick();
  await setImmediate();
  assert.deepEqual(copied, [url]);
  assert.match(announcement(), /Link copied/);
  await wait(2050);
  assert.equal(announcement(), "");
  navigator.clipboard.writeText = async () => {
    throw new Error("Denied");
  };
  copyButton().onClick();
  await setImmediate();
  assert.match(announcement(), /Select and copy/);
  assert.equal(render().find((n) => n.type === "popover").props.open, true);
  assert.equal(render().find((n) => n.type === "input").props.value, url);
  assert.match(state.errors.at(-1), /Couldn't copy/);
  const mail = render().find((n) => n.type === "a").props.href;
  assert.equal(mail, `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`);
  navigator.clipboard.writeText = async (value) => copied.push(value);
  copyButton().onClick();
  await setImmediate();
  assert.match(announcement(), /Link copied/);
  const shared = [];
  navigator.share = async (data) => shared.push(data);
  let prevented = false;
  shareButton().onClick({
    preventDefault() {
      prevented = true;
    },
  });
  await setImmediate();
  assert.equal(prevented, true);
  assert.deepEqual(shared, [{ title, url }]);
  const errorCount = state.errors.length;
  navigator.share = async () => {
    throw new DOMException("Cancelled", "AbortError");
  };
  shareButton().onClick({ preventDefault() {} });
  await setImmediate();
  assert.equal(state.errors.length, errorCount);
  navigator.share = async () => {
    throw new Error("Unavailable");
  };
  shareButton().onClick({ preventDefault() {} });
  await setImmediate();
  assert.equal(render().find((n) => n.type === "popover").props.open, true);
  assert.match(state.errors.at(-1), /share by email/);
  delete navigator.share;
  prevented = false;
  shareButton().onClick({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, false, "Unsupported native sharing leaves the accessible popover trigger active");
});
