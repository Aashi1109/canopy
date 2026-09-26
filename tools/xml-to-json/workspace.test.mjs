// @vitest-environment jsdom
import { vi } from "vitest";
import definition from "./definition.ts";
import { run } from "./run.ts";
import { setupReactTools } from "../../tests/helpers/react-tools.mjs";
import { testJsonWorkspace } from "../../tests/helpers/json-generic-workspace.mjs";

vi.mock("@/components/content/CodeEditor", async () => ({
  CodeEditor: (await import("../../tests/helpers/react-tools.mjs")).TextEditorBoundary,
}));
vi.mock("@/components/FileProcessorWorkspace", () => ({ FileProcessorWorkspace: () => null }));
vi.mock("@/app/media/components/ImageConversionWorkspace", () => ({ ImageConversionWorkspace: () => null }));
setupReactTools();
testJsonWorkspace(definition, run, {
  source: "<root><name>Ada</name><active>false</active></root>",
  expected: '{\n  "root": {\n    "name": "Ada",\n    "active": "false"\n  }\n}',
  invalid: "<root>",
});
