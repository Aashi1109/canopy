// @vitest-environment jsdom
import assert from "node:assert/strict";
import React, { useState } from "react";
import { test } from "vitest";
import { SettingsPanel } from "../components/SettingsPanel.tsx";
import { button, click, field, fill, mountTool, setupReactTools } from "./helpers/react-tools.mjs";

setupReactTools();

test("SettingsPanel rows retain defaults, edits, additions, removals, and keyboard focus", async () => {
  let settings;
  const spec = {
    fields: {
      headers: {
        kind: "rows",
        label: "Headers",
        keyLabel: "Header name",
        valueLabel: "Header value",
        default: [{ key: "Accept", value: "application/json" }],
      },
    },
  };
  function Harness() {
    const [values, setValues] = useState({});
    settings = values;
    return React.createElement(SettingsPanel, {
      spec,
      values,
      onChange: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    });
  }
  await mountTool(React.createElement(Harness));
  assert.equal(field("Header name 1").value, "Accept");
  await fill(field("Header value 1"), "text/html");
  assert.deepEqual(settings.headers, [{ key: "Accept", value: "text/html" }]);

  await click(button("Add row"));
  assert.equal(document.activeElement, field("Header name 2"));
  await fill(field("Header name 2"), "X-Environment");
  await fill(field("Header value 2"), "preview");
  assert.deepEqual(settings.headers, [
    { key: "Accept", value: "text/html" },
    { key: "X-Environment", value: "preview" },
  ]);

  await click(button("Remove row 1"));
  assert.equal(document.activeElement, field("Header name 1"));
  assert.deepEqual(settings.headers, [{ key: "X-Environment", value: "preview" }]);
  await click(button("Remove row 1"));
  assert.deepEqual(settings.headers, []);
  assert.equal(document.activeElement, button("Add row"));
});

test("SettingsPanel rows keep controls unavailable when disabled", async () => {
  const changes = [];
  const view = await mountTool(
    React.createElement(SettingsPanel, {
      disabled: true,
      spec: {
        fields: {
          parameters: {
            kind: "rows",
            label: "Parameters",
            keyLabel: "Key",
            valueLabel: "Value",
            default: [{ key: "tag", value: "web" }],
          },
        },
      },
      values: {},
      onChange: (...change) => changes.push(change),
    }),
  );
  assert.ok([...view.container.querySelectorAll("input, button")].every((control) => control.disabled));
  await click(button("Add row"));
  await click(button("Remove row 1"));
  assert.deepEqual(changes, []);
});
