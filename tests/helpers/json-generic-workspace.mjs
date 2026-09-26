import { expect, test, vi } from "vitest";
import { fill, click, button, field, waitFor } from "./react-tools.mjs";
import { mountWorkspace, choose, openSettings } from "./tool-workspace.mjs";

export function testJsonWorkspace(definition, run, fixture) {
  test("source and settings reach the real executor and copy the exact result", async () => {
    await mountWorkspace(definition, run);
    const inputLabel = definition.input.kind === "fields" ? definition.input.fields[0].label : definition.input.label;
    await fill(field(inputLabel), fixture.source);
    if (fixture.secondary !== undefined) await fill(field(definition.input.fields[1].label), fixture.secondary);
    if (fixture.setting) {
      await openSettings();
      await choose(fixture.setting.label, fixture.setting.option);
    }
    await click(button("Run test operation"));
    const clipboard = vi.fn().mockResolvedValue();
    vi.stubGlobal(
      "navigator",
      Object.defineProperty(Object.create(navigator), "clipboard", { value: { writeText: clipboard } }),
    );
    await waitFor(() => expect(button("Copy all")?.disabled).toBe(false));
    await click(button("Copy all"));
    expect(clipboard).toHaveBeenLastCalledWith(fixture.expected);
  });

  if (fixture.invalid)
    test("invalid input shows feedback and edited input recovers with the correct result", async () => {
      const view = await mountWorkspace(definition, run);
      const inputLabel = definition.input.kind === "fields" ? definition.input.fields[0].label : definition.input.label;
      await fill(field(inputLabel), fixture.invalid);
      if (fixture.secondary !== undefined) await fill(field(definition.input.fields[1].label), fixture.secondary);
      await click(button("Run test operation"));
      await waitFor(() => expect(view.container.textContent).toContain("Unable to create the result"));
      expect(button("Copy all")?.disabled ?? true).toBe(true);
      await fill(field(inputLabel), fixture.source);
      if (fixture.setting) {
        await openSettings();
        await choose(fixture.setting.label, fixture.setting.option);
      }
      await click(button("Run test operation"));
      const clipboard = vi.fn().mockResolvedValue();
      vi.stubGlobal(
        "navigator",
        Object.defineProperty(Object.create(navigator), "clipboard", { value: { writeText: clipboard } }),
      );
      await waitFor(() => expect(button("Copy all")?.disabled).toBe(false));
      await click(button("Copy all"));
      expect(clipboard).toHaveBeenLastCalledWith(fixture.expected);
    });
}
