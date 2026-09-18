import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/toast.tsx") && specifier === "./button.tsx") {
      return { shortCircuit: true, url: "data:text/javascript,export const Button = 'button';" };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/toast.tsx")) return next(url, context);
    return {
      shortCircuit: true,
      format: "module",
      source: transformSync(readFileSync(new URL(url), "utf8"), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
        module: { type: "es6" },
      }).code,
    };
  },
});
const { toast } = await import("../components/ui/components/toast.tsx");
test.after(() => hooks.deregister());

test("shared notifications preserve IDs, urgency, timeouts, actions, and dismiss through Base UI", () => {
  const events = [];
  const unsubscribe = toast[" subscribe"]((event) => events.push(event));
  try {
    let undone = 0;
    const cancel = { label: "Open Trash", onClick() {} };
    const id = toast.success("Moved to trash", {
      id: "post-1",
      description: "Your content is retained.",
      duration: 10000,
      closeButton: true,
      action: {
        label: "Undo",
        onClick() {
          undone++;
        },
      },
      cancel,
    });
    assert.equal(id, "post-1");
    assert.equal(events[0].options.title, "Moved to trash");
    assert.equal(events[0].options.description, "Your content is retained.");
    assert.equal(events[0].options.timeout, 10000);
    assert.equal(events[0].options.priority, "low");
    assert.deepEqual(events[0].options.data, { closeButton: true, cancel });
    events[0].options.actionProps.onClick({ defaultPrevented: false });
    assert.equal(undone, 1);
    assert.deepEqual(events.at(-1), { action: "close", options: { id } });
    events[0].options.actionProps.onClick({ defaultPrevented: true });
    assert.equal(events.length, 2);
    toast.error("Retry this operation", { id, duration: 6000 });
    assert.equal(events.at(-1).options.id, id);
    assert.equal(events.at(-1).options.priority, "high");
    assert.equal(events.at(-1).options.type, "error");
    toast.dismiss(id);
    assert.deepEqual(events.at(-1), { action: "close", options: { id } });
    toast.dismiss();
    assert.deepEqual(events.at(-1), { action: "close", options: { id: undefined } });
  } finally {
    unsubscribe();
  }
});
