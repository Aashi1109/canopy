import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { value: null, errors: [] };
globalThis.__blogCopyTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/CopyBlogCode.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(
        "export function useState() { const s = globalThis.__blogCopyTest; return [s.value, value => s.value = value]; }",
      );
    if (specifier === "@/components/ui/index.tsx")
      return stub(
        "export const ToolActionButton = 'button', Tooltip = 'tooltip', TooltipContent = 'tooltip-content', TooltipProvider = 'provider', TooltipTrigger = 'trigger'; export const toast = {error(message) {globalThis.__blogCopyTest.errors.push(message);}};",
      );
    if (specifier.endsWith(".css")) return stub("export default {};");
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/CopyBlogCode.tsx")) return next(url, context);
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
const { CopyBlogCode } = await import("../components/blog/CopyBlogCode.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogCopyTest;
});
const walk = (node) =>
  Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const render = (code) => walk(CopyBlogCode({ code }));
const button = (nodes) => nodes.find((node) => node.type === "button").props;
const status = (nodes) => nodes.find((node) => node.props.role === "status").props.children;

test("code copy preserves source, reports success, resets for edits, and recovers after clipboard failure", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  const clipboard = {
    async writeText(code) {
      copied.push(code);
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });
  const source = "SELECT *\n  FROM documents;\n";
  button(render(source)).onClick();
  await setImmediate();
  assert.deepEqual(copied, [source]);
  assert.equal(status(render(source)), "Code copied to clipboard.");
  assert.equal(status(render("changed")), "");

  clipboard.writeText = async () => {
    throw new Error("Permission denied");
  };
  button(render(source)).onClick();
  await setImmediate();
  assert.match(status(render(source)), /Select the code and copy it manually/);
  assert.match(state.errors.at(-1), /Select the code and copy it manually/);
  assert.equal(button(render(source))["aria-label"], "Retry copying code");
  clipboard.writeText = async (code) => copied.push(code);
  button(render(source)).onClick();
  await setImmediate();
  assert.equal(status(render(source)), "Code copied to clipboard.");
});
