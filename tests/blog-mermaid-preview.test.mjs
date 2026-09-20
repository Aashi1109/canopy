import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { transformSync } from "next/dist/build/swc/index.js";

const state = { values: [], index: 0, png: async () => {}, errors: [] };
globalThis.__blogMermaidTest = state;
const stub = (source) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` });
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/MermaidDiagram.tsx")) return next(specifier, context);
    if (specifier === "react")
      return stub(
        "export function useState(initial) { const s = globalThis.__blogMermaidTest; const i=s.index++; if (!(i in s.values)) s.values[i]=initial; return [s.values[i], value => s.values[i] = value]; } export function useEffect() {}",
      );
    if (specifier === "@/components/ui/index.tsx")
      return stub(
        "export const Button = 'button', Tooltip = 'tooltip', TooltipContent = 'tooltip-content', TooltipProvider = 'provider', TooltipTrigger = 'trigger'; export const Popover = {Root: 'popover', Trigger: 'trigger', Portal: 'portal', Content: 'content', Close: 'close'}; export const toast = {error(message) { globalThis.__blogMermaidTest.errors.push(message); }};",
      );
    if (specifier === "@/lib/markdown/diagramExport")
      return stub("export async function diagramPng(svg) { return globalThis.__blogMermaidTest.png(svg); }");
    if (specifier === "./MermaidPreview") return stub("export const MermaidPreview = 'full-preview';");
    if (specifier.endsWith(".css")) return stub("export default {};");
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith("/MermaidDiagram.tsx")) return next(url, context);
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
const { MermaidDiagram } = await import("../components/content/MermaidDiagram.tsx");
test.after(() => {
  hooks.deregister();
  delete globalThis.__blogMermaidTest;
});
const walk = (node) =>
  Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const source = "flowchart LR\n A[Upload] --> B[Download]";
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>A &amp; B</text></svg>';
function render(previewable = true) {
  state.index = 0;
  return walk(MermaidDiagram({ source, previewable }));
}
test("only read-view diagrams open a preview with exact SVG/source downloads and can close", () => {
  state.values = [{ source, svg }, false];
  assert.equal(
    render(false).some((node) => node.type === "button"),
    false,
  );
  const button = render().find((node) => node.props["aria-label"] === "Open Mermaid diagram preview");
  button.props.onClick();
  const preview = render().find((node) => node.type === "full-preview");
  assert.equal(preview.props.svg, svg);
  const links = walk(preview.props.downloads).filter((node) => node.type === "a");
  assert.deepEqual(
    links.map((node) => [node.props.download, decodeURIComponent(node.props.href.split(",").slice(1).join(","))]),
    [
      ["diagram.svg", svg],
      ["diagram.mmd", source],
    ],
  );
  preview.props.onClose();
  assert.equal(
    render().some((node) => node.type === "full-preview"),
    false,
  );
  state.values = [{ source, error: "Invalid diagram" }, false];
  assert.equal(
    render().some((node) => node.type === "button"),
    false,
  );
});

test("PNG export reports loading and offers recovery when rendering fails", async () => {
  state.values = [{ source, svg }, true, false];
  state.errors = [];
  state.png = async () => {
    throw new Error("Canvas unavailable");
  };
  const downloadNodes = () => walk(render().find((node) => node.type === "full-preview").props.downloads);
  downloadNodes()
    .find((node) => node.type === "button" && node.props.children === "Download PNG")
    .props.onClick();
  assert.ok(downloadNodes().some((node) => node.props.loading === true));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(state.errors, ["PNG download failed. Try again or download SVG."]);
  assert.equal(downloadNodes().find((node) => node.props.children === "Download PNG").props.loading, false);
});
