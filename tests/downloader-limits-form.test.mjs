// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DownloaderLimitsForm } from "../app/admin/(protected)/downloaders/components/DownloaderLimitsForm.tsx";

const policy = {
  version: 1,
  guest: { daily: 5, active: 1, queued: 2 },
  account: { daily: 30, active: 3, queued: 5 },
  updatedAt: "2026-06-01T00:00:00Z",
};
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
let root, container, fetcher;
const button = (label) => [...container.querySelectorAll("button")].find((node) => node.textContent.trim() === label);
async function change(id, value) {
  await act(async () => {
    const input = document.getElementById(id);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function mount(canEdit = true) {
  await act(async () => root.render(React.createElement(DownloaderLimitsForm, { canEdit })));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  fetcher = vi.fn(async () => reply({ policy }));
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("invalid capacity never submits and focuses the associated error field", async () => {
  await mount();
  await change("guest-active", "251");
  await submit();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(document.activeElement.id).toBe("guest-active");
  expect(document.activeElement.getAttribute("aria-invalid")).toBe("true");
});

test("a version conflict preserves the draft and requires explicit reload before saving against the new version", async () => {
  let latest = policy;
  let conflict = true;
  fetcher.mockImplementation(async (_url, init) => {
    if (init.method === "PUT") {
      if (conflict) return reply({ error: { message: "Changed by another administrator." } }, 409);
      const submitted = JSON.parse(init.body);
      expect(submitted.expectedVersion).toBe(2);
      latest = { ...latest, version: 3, guest: submitted.guest, account: submitted.account };
    }
    return reply({ policy: latest });
  });
  await mount();
  await change("guest-daily", "9");
  await submit();
  expect(document.getElementById("guest-daily").value).toBe("9");
  expect(button("Save limits").disabled).toBe(true);
  latest = { ...policy, version: 2, guest: { ...policy.guest, daily: 7 } };
  await act(async () => button("Reload limits").click());
  expect(document.getElementById("guest-daily").value).toBe("9");
  expect(container.textContent).toContain("Saved: 7.");
  conflict = false;
  await submit();
  expect(latest.version).toBe(3);
  expect(latest.guest.daily).toBe(9);
  expect(button("Save limits").disabled).toBe(true);
});

test("view permission alone cannot issue a policy mutation", async () => {
  await mount(false);
  expect(document.getElementById("guest-daily").readOnly).toBe(true);
  expect(button("Save limits")).toBeUndefined();
  await submit();
  expect(fetcher.mock.calls.some(([, init]) => init.method === "PUT")).toBe(false);
});

test.each([false, true])(
  "reload refreshes unchanged fields without manufacturing a draft (canEdit=%s)",
  async (canEdit) => {
    let latest = policy;
    fetcher.mockImplementation(async () => reply({ policy: latest }));
    await mount(canEdit);
    latest = { ...policy, version: 2, guest: { ...policy.guest, daily: 12 } };
    await act(async () =>
      [...container.querySelectorAll("button")].find((node) => node.textContent.startsWith("Reload limits")).click(),
    );
    expect(document.getElementById("guest-daily").value).toBe("12");
    expect(button("Discard draft")).toBeUndefined();
    if (canEdit) expect(button("Save limits").disabled).toBe(true);
    expect(fetcher.mock.calls.some(([, init]) => init.method === "PUT")).toBe(false);
  },
);

test("a lost save response keeps the draft and reload recovers the committed version without another mutation", async () => {
  let latest = policy;
  fetcher.mockImplementation(async (_url, init) => {
    if (init.method === "PUT") {
      const submitted = JSON.parse(init.body);
      latest = { ...policy, version: 2, guest: submitted.guest, account: submitted.account };
      throw new TypeError("Network unavailable");
    }
    return reply({ policy: latest });
  });
  await mount();
  await change("guest-daily", "8");
  await submit();
  expect(document.getElementById("guest-daily").value).toBe("8");
  expect(button("Save limits").disabled).toBe(true);
  await act(async () => button("Reload limits").click());
  expect(document.getElementById("guest-daily").value).toBe("8");
  expect(button("Save limits").disabled).toBe(true);
  await submit();
  expect(fetcher.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(1);
});

test.each(["invalid-policy", "non-json"])(
  "malformed load responses cannot populate limits and a successful retry restores editing (%s)",
  async (kind) => {
    fetcher.mockResolvedValueOnce(
      kind === "invalid-policy"
        ? reply({ policy: { ...policy, guest: { ...policy.guest, daily: 0 } } })
        : new Response("Bad gateway", { status: 502 }),
    );
    await mount();
    expect(document.getElementById("guest-daily")).toBeNull();
    expect(button("Save limits").disabled).toBe(true);
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((node) => /(?:Reload|Load|Retry loading) limits/.test(node.textContent))
        .click(),
    );
    expect(document.getElementById("guest-daily").value).toBe("5");
    await change("guest-daily", "6");
    expect(button("Save limits").disabled).toBe(false);
  },
);

test("permission denial during save preserves input and requires reloading before any retry", async () => {
  fetcher.mockImplementation(async (_url, init) =>
    init.method === "PUT"
      ? reply({ error: { code: "FORBIDDEN", message: "You no longer have permission to edit these limits." } }, 403)
      : reply({ policy }),
  );
  await mount();
  await change("guest-daily", "9");
  await submit();
  expect(document.getElementById("guest-daily").value).toBe("9");
  expect(button("Save limits").disabled).toBe(true);
  await submit();
  expect(fetcher.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(1);
  expect(button("Save limits").disabled).toBe(true);
});

test("duplicate save activation admits only one pending policy mutation", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  fetcher.mockImplementation(async (_url, init) => {
    if (init.method === "PUT") {
      await pending;
      return reply({ policy: { ...policy, version: 2, guest: { ...policy.guest, daily: 8 } } });
    }
    return reply({ policy });
  });
  await mount();
  await change("guest-daily", "8");
  await submit();
  await submit();
  expect(fetcher.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(1);
  await act(async () => release());
  expect(document.getElementById("guest-daily").value).toBe("8");
  expect(button("Save limits").disabled).toBe(true);
});
