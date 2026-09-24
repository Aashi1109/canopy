import { setImmediate } from "node:timers/promises";
import { afterAll, expect, onTestFinished, test, vi } from "vitest";

const state = { value: null, errors: [] };
globalThis.__blogCopyTest = state;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal()),
  useState: () => {
    const s = globalThis.__blogCopyTest;
    return [s.value, (value) => (s.value = value)];
  },
}));
vi.mock("@/components/ui/index.tsx", () => ({
  ToolActionButton: "button",
  Tooltip: "tooltip",
  TooltipContent: "tooltip-content",
  TooltipProvider: "provider",
  TooltipTrigger: "trigger",
  toast: {
    error(message) {
      globalThis.__blogCopyTest.errors.push(message);
    },
  },
}));

const { CopyCode } = await import("../components/content/CopyCode.tsx");
afterAll(() => {
  delete globalThis.__blogCopyTest;
});
const walk = (node) =>
  Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const render = (code) => walk(CopyCode({ code }));
const button = (nodes) => nodes.find((node) => node.type === "button").props;
const status = (nodes) => nodes.find((node) => node.props.role === "status").props.children;

test("code copy preserves source, reports success, resets for edits, and recovers after clipboard failure", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  const clipboard = {
    async writeText(code) {
      copied.push(code);
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
  onTestFinished(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  });
  const source = "SELECT *\n  FROM documents;\n";
  button(render(source)).onClick();
  await setImmediate();
  expect(copied).toEqual([source]);
  expect(status(render(source))).toBe("Code copied to clipboard.");
  expect(status(render("changed"))).toBe("");

  clipboard.writeText = async () => {
    throw new Error("Permission denied");
  };
  button(render(source)).onClick();
  await setImmediate();
  expect(status(render(source))).toMatch(/Select the code and copy it manually/);
  expect(state.errors.at(-1)).toMatch(/Select the code and copy it manually/);
  expect(button(render(source))["aria-label"]).toBe("Retry copying code");
  clipboard.writeText = async (code) => copied.push(code);
  button(render(source)).onClick();
  await setImmediate();
  expect(status(render(source))).toBe("Code copied to clipboard.");
});
