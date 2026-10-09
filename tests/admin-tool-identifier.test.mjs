// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ToolIdentifier } from "../app/admin/(protected)/tools/[toolId]/components/ToolConfigurationPanels.tsx";
import { toast } from "../components/ui/index.tsx";
import { setupReactTools, mountTool, button, click, waitFor } from "./helpers/react-tools.mjs";

vi.mock("../app/admin/actions", () => ({ toggleToolAction: vi.fn() }));
vi.mock("../app/admin/(protected)/tools/actions", () => ({ publishToolContentAction: vi.fn() }));
setupReactTools();

let clipboardDescriptor;
let writeText;
let success;
let error;

beforeEach(() => {
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  success = vi.spyOn(toast, "success").mockImplementation(() => "copy-success");
  error = vi.spyOn(toast, "error").mockImplementation(() => "copy-error");
});

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else delete navigator.clipboard;
});

test("copying the displayed tool identifier writes its exact value and reports success", async () => {
  const toolId = "paperwork.receipt-generator";
  const view = await mountTool(React.createElement(ToolIdentifier, { toolId }));
  expect(view.container.textContent).toContain(toolId);

  await click(button("Copy tool ID"));

  expect(writeText).toHaveBeenCalledExactlyOnceWith(toolId);
  await waitFor(() => expect(success).toHaveBeenCalledWith("Tool ID copied."));
  expect(error).not.toHaveBeenCalled();
});

test("a rejected clipboard write reports failure and leaves copying available for retry", async () => {
  const toolId = "devtools.json-viewer";
  writeText.mockRejectedValueOnce(new Error("Clipboard permission denied"));
  const view = await mountTool(React.createElement(ToolIdentifier, { toolId }));

  await click(button("Copy tool ID"));

  await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  expect(success).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain(toolId);
  expect(button("Copy tool ID").disabled).toBe(false);

  await click(button("Copy tool ID"));

  expect(writeText.mock.calls).toEqual([[toolId], [toolId]]);
  await waitFor(() => expect(success).toHaveBeenCalledWith("Tool ID copied."));
  expect(error).toHaveBeenCalledTimes(1);
});
