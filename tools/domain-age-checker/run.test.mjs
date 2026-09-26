import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => {
    throw new Error("Unexpected network request: install a response fixture");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const context = (text = "example.com", settings = {}, signal = new AbortController().signal) => ({
  input: { text, files: [] },
  settings,
  signal,
});
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
import { run as age } from "./run.ts";

describe("domain-age-checker: public registry boundaries", () => {
  test.each(["", "   ", "localhost", "not a domain", "https://[::1]/"])(
    "rejects %j before a request",
    async (input) => {
      await expect(age(context(input))).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  test("normalizes URLs and asks only the fixed RDAP service", async () => {
    fetchMock.mockResolvedValue(response({}));
    const result = await age(context(" HTTPS://WWW.EXAMPLE.COM:443/path?token=private#fragment "));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://rdap.org/domain/example.com");
    expect(options.headers.accept).toBe("application/rdap+json, application/json");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result.downloadName).toBe("domain-registration.json");
    expect(JSON.parse(result.text)).toEqual({
      domain: "example.com",
      registered: null,
      expires: null,
      updated: null,
      status: [],
      nameservers: [],
    });
  });
  test.each([404, 429, 500, 503])("HTTP %i remains an error with RDAP recovery guidance", async (status) => {
    fetchMock.mockResolvedValue(response({}, status));
    await expect(age(context())).rejects.toMatchObject({
      code: "lookup-failed",
      message: `RDAP lookup failed (${status}).`,
      recovery: expect.stringMatching(/TLD/),
    });
  });
  test.each([null, [], "unexpected", 7, false])("rejects non-record response %j", async (data) => {
    fetchMock.mockResolvedValue(response(data));
    await expect(age(context())).rejects.toMatchObject({ code: "rdap-invalid-response" });
  });
  test("network failure keeps the underlying transport message out of the user error", async () => {
    fetchMock.mockRejectedValue(new Error("private transport details"));
    await expect(age(context())).rejects.toMatchObject({
      code: "rdap-unreachable",
      message: "Domain Age Checker could not reach the public RDAP service.",
      recovery: expect.stringMatching(/try again/i),
    });
  });
  test("the ten-second deadline terminates a pending RDAP request with recovery guidance", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    fetchMock.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const output = age(context());
    const failed = expect(output).rejects.toMatchObject({
      code: "rdap-unreachable",
      recovery: expect.stringMatching(/try again/i),
    });
    expect(timeout).toHaveBeenCalledWith(10_000);
    deadline.abort(new DOMException("Registry timed out", "TimeoutError"));
    await failed;
  });
  test("malformed JSON cannot publish a registration record", async () => {
    fetchMock.mockResolvedValue(new Response("not json"));
    await expect(age(context())).rejects.toThrow();
  });
  test("a canceled lookup cannot publish registration data", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return response({ ldhName: "example.com" });
    });
    await expect(age(context("example.com", {}, controller.signal))).rejects.toMatchObject({ name: "AbortError" });
  });
  test("caller cancellation aborts the active RDAP transport", async () => {
    const controller = new AbortController();
    let requestSignal, finish;
    fetchMock.mockImplementation((_url, { signal }) => {
      requestSignal = signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const output = age(context("example.com", {}, controller.signal));
    const canceled = expect(output).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    finish(response({ ldhName: "example.com" }));
    await canceled;
    expect(requestSignal.aborted).toBe(true);
  });
  test("canceling an active fetch stays cancellation instead of an RDAP error", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const output = age(context("example.com", {}, controller.signal));
    controller.abort();
    await expect(output).rejects.toMatchObject({ name: "AbortError" });
  });
  test("an already canceled lookup never contacts the registry", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(age(context("example.com", {}, controller.signal))).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
