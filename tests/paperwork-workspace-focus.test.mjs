// @vitest-environment jsdom
import React, { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { WorkbenchPanes } from "../components/tool-workbench/WorkbenchPanes.tsx";
import {
  WorkbenchFocusButton,
  WorkbenchPresentationProvider,
  WorkbenchViewControl,
} from "../components/ui/components/workbench-presentation.tsx";
import { PaperworkMobileTabs } from "../app/paperwork/components/PaperworkWorkspace.tsx";
import { setupReactTools, mountTool, click, button, fill } from "./helpers/react-tools.mjs";

setupReactTools();

function Workspace() {
  const [text, setText] = useState("Draft retained");
  return React.createElement(
    WorkbenchPresentationProvider,
    null,
    React.createElement(WorkbenchFocusButton),
    React.createElement(WorkbenchViewControl),
    React.createElement(PaperworkMobileTabs, { "aria-label": "Regular mobile view" }),
    React.createElement(
      WorkbenchPanes,
      { singlePaneDisplay: "block" },
      React.createElement(
        "div",
        { "data-testid": "input-pane" },
        React.createElement("input", {
          "aria-label": "Document text",
          value: text,
          onChange: (event) => setText(event.target.value),
        }),
      ),
      React.createElement("div", { "data-testid": "preview-pane", className: "hidden" }, text),
    ),
  );
}

test("narrow focus view reveals the selected document pane and preserves edits on return", async () => {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: query.includes("max-width") || query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  const view = await mountTool(React.createElement(Workspace));
  const input = view.container.querySelector('input[aria-label="Document text"]');
  const inputPane = view.container.querySelector('[data-testid="input-pane"]');
  const preview = view.container.querySelector('[data-testid="preview-pane"]');
  await fill(input, "My current edit");
  await click(button("Expand workspace", view.container));
  expect(view.container.querySelector('[aria-label="Regular mobile view"]')).toBeNull();
  await act(async () => button("Preview", view.container).focus());
  expect(inputPane.hasAttribute("inert")).toBe(true);
  expect(preview.hasAttribute("inert")).toBe(false);
  expect(preview.style.display).toBe("block");
  expect(preview.textContent).toBe("My current edit");
  await act(async () => button("Input", view.container).focus());
  expect(inputPane.hasAttribute("inert")).toBe(false);
  expect(preview.hasAttribute("inert")).toBe(true);
  expect(input.value).toBe("My current edit");
  await click(button("Exit focus mode", view.container));
  expect(view.container.querySelector('[aria-label="Regular mobile view"]')).not.toBeNull();
  expect(preview.style.display).toBe("");
  expect(input.value).toBe("My current edit");
});
