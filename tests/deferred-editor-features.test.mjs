// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { scheduleEditorFeatures } from "../components/content/deferredEditorFeatures.ts";

let readyState;
let idleCallback;

beforeEach(() => {
  vi.useFakeTimers();
  readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
  idleCallback = undefined;
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((callback) => {
      idleCallback = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelIdleCallback", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("optional features wait for both page load and an idle turn", () => {
  const callback = vi.fn();
  const cancel = scheduleEditorFeatures(callback);

  vi.runAllTimers();
  expect(requestIdleCallback).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();

  readyState.mockReturnValue("complete");
  window.dispatchEvent(new Event("load"));
  expect(requestIdleCallback).toHaveBeenCalledTimes(1);
  expect(requestIdleCallback.mock.calls[0]).toHaveLength(1);
  expect(callback).not.toHaveBeenCalled();

  idleCallback();
  expect(callback).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("load"));
  expect(requestIdleCallback).toHaveBeenCalledTimes(1);
  cancel();
});

test("an already loaded page still waits for idle time", () => {
  readyState.mockReturnValue("complete");
  const callback = vi.fn();
  scheduleEditorFeatures(callback);

  expect(requestIdleCallback).toHaveBeenCalledTimes(1);
  expect(callback).not.toHaveBeenCalled();
  idleCallback();
  expect(callback).toHaveBeenCalledTimes(1);
});

test("browsers without idle callbacks use a delayed task only after load", () => {
  vi.stubGlobal("requestIdleCallback", undefined);
  const callback = vi.fn();
  scheduleEditorFeatures(callback);

  vi.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("load"));
  expect(callback).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(callback).toHaveBeenCalledTimes(1);
});

test("cancelling before load prevents optional work from being scheduled", () => {
  const callback = vi.fn();
  const cancel = scheduleEditorFeatures(callback);
  cancel();

  window.dispatchEvent(new Event("load"));
  vi.runAllTimers();
  expect(requestIdleCallback).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});

test("cancelling an idle task removes it and ignores an already queued callback", () => {
  readyState.mockReturnValue("complete");
  const callback = vi.fn();
  const cancel = scheduleEditorFeatures(callback);
  cancel();

  expect(cancelIdleCallback).toHaveBeenCalledWith(1);
  idleCallback();
  expect(callback).not.toHaveBeenCalled();
});

test("cancelling the fallback task clears its timer", () => {
  readyState.mockReturnValue("complete");
  vi.stubGlobal("requestIdleCallback", undefined);
  const callback = vi.fn();
  const cancel = scheduleEditorFeatures(callback);
  cancel();

  expect(vi.getTimerCount()).toBe(0);
  vi.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
});

test("server-side calls safely do nothing", () => {
  vi.stubGlobal("window", undefined);
  const callback = vi.fn();
  const cancel = scheduleEditorFeatures(callback);

  cancel();
  vi.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
});
