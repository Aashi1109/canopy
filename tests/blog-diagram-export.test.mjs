import { expect, test, onTestFinished } from "vitest";
import { diagramPng } from "../lib/markdown/diagramExport.ts";

function browser(t) {
  const state = { bounds: "0 0 500 200", attributes: {}, removed: [], calls: [], error: null, uri: "" };
  const context = {
    fillStyle: "",
    fillRect: (...args) => state.calls.push(["fill", context.fillStyle, ...args]),
    drawImage: (_image, ...args) => state.calls.push(["draw", ...args]),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => (state.error === "context" ? null : context),
    toBlob: (callback, type) => {
      if (state.error === "tainted") throw new Error("Canvas is tainted");
      callback(state.error === "empty" ? null : new Blob(["png"], { type }));
    },
  };
  const root = {
    getAttribute: () => state.bounds,
    setAttribute: (key, value) => {
      state.attributes[key] = value;
    },
    style: { removeProperty: (key) => state.removed.push(key) },
  };
  const globals = {
    DOMParser: class {
      parseFromString() {
        return { documentElement: root, querySelector: (selector) => (selector === "svg" ? root : null) };
      }
    },
    XMLSerializer: class {
      serializeToString() {
        return "<svg><foreignObject>Résumé ✓</foreignObject></svg>";
      }
    },
    Image: class {
      set src(value) {
        state.uri = value;
      }
      async decode() {
        if (state.error === "decode") throw new Error("Cannot decode");
      }
    },
    document: { createElement: () => canvas },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = globalThis[key];
    globalThis[key] = value;
    onTestFinished(() => {
      if (previous === undefined) delete globalThis[key];
      else globalThis[key] = previous;
    });
  }
  return { state, canvas };
}

test("diagram PNG preserves Unicode labels through a data URI and exports double-resolution on white", async (t) => {
  const { state, canvas } = browser(t);
  const result = await diagramPng("<svg />");
  expect(result.type).toBe("image/png");
  expect([canvas.width, canvas.height]).toEqual([1000, 400]);
  expect(state.attributes.width).toBe("1000");
  expect(state.attributes.height).toBe("400");
  expect(state.removed.includes("max-width")).toBeTruthy();
  expect(state.uri).toMatch(/^data:image\/svg\+xml/);
  expect(decodeURIComponent(state.uri)).toMatch(/<foreignObject>Résumé ✓<\/foreignObject>/);
  expect(state.calls).toEqual([
    ["fill", "#ffffff", 0, 0, 1000, 400],
    ["draw", 0, 0, 1000, 400],
  ]);
});

test("large diagram exports stay within side and pixel limits", async (t) => {
  const { state, canvas } = browser(t);
  for (const bounds of ["0 0 20000 200", "0 0 200 20000", "0 0 20000 20000"]) {
    state.bounds = bounds;
    await diagramPng("<svg />");
    expect(canvas.width > 0 && canvas.height > 0).toBeTruthy();
    expect(canvas.width <= 8192 && canvas.height <= 8192).toBeTruthy();
    expect(canvas.width * canvas.height <= 16_000_000).toBeTruthy();
  }
});

test("invalid dimensions and browser export failures reject without a download", async (t) => {
  const { state } = browser(t);
  for (const bounds of [null, "", "0 0 0 20", "0 0 -1 20", "0 0 Infinity 20", "0 0 NaN 20", "0 0 30", "0 0 1e100 20"]) {
    state.bounds = bounds;
    await expect(diagramPng("<svg />")).rejects.toThrow();
  }
  state.bounds = "0 0 500 200";
  for (const error of ["decode", "context", "empty", "tainted"]) {
    state.error = error;
    await expect(diagramPng("<svg />")).rejects.toThrow();
  }
});
