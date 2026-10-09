import { expect, test } from "vitest";
import { ToolError, parseToolErrorDetails, translateToolError } from "../lib/tool-framework/run.ts";
import { createTranslator } from "next-intl";
import { getCommonMessages } from "../lib/i18n/messages.ts";
import {
  beginWorkerJob,
  createToolJobState,
  isToolWorkerResponse,
  reduceWorkerJobState,
} from "../lib/tool-framework/workerProtocol.ts";

test("structured error details preserve coordinates and ICU values while dropping unrelated properties", () => {
  const source = { line: 2, column: 4, values: { line: 2, column: 4, field: "name" }, stack: "private" };
  const failure = new ToolError("json-syntax", "Technical detail", "Check syntax", source);
  expect(failure.details).toEqual({ line: 2, column: 4, values: { line: 2, column: 4, field: "name" } });
  source.values.field = "changed";
  expect(failure.details.values.field).toBe("name");
  const response = {
    type: "failure",
    jobId: "json",
    code: failure.code,
    message: failure.message,
    details: failure.details,
  };
  expect(isToolWorkerResponse(response)).toBe(true);
  const state = reduceWorkerJobState(beginWorkerJob(createToolJobState(), "json"), response);
  expect(state.error.details).toEqual(failure.details);
  expect(state.error.message).toBe("Technical detail");
});

test.each([
  null,
  [],
  { line: 0 },
  { column: -1 },
  { line: 1.5 },
  { line: Infinity },
  { values: [] },
  { values: { count: NaN } },
  { values: { data: {} } },
  { values: { "bad.key": "value" } },
])("rejects invalid error detail data %j", (details) => {
  expect(parseToolErrorDetails(details)).toBeUndefined();
  expect(new ToolError("invalid", "Detail", undefined, details).details).toBeUndefined();
  expect(isToolWorkerResponse({ type: "failure", jobId: "json", code: "invalid", message: "Detail", details })).toBe(
    false,
  );
});

test("legacy errors without structured details remain valid", () => {
  expect(isToolWorkerResponse({ type: "failure", jobId: "json", code: "invalid", message: "Detail" })).toBe(true);
});

test("known platform errors are localized while tool messages take precedence and diagnostics survive", () => {
  const t = createTranslator({ locale: "hi", messages: getCommonMessages("hi"), namespace: "Workbench" });
  const common = (message) => (t.has(message.key) ? t(message.key, message.values) : undefined);
  const rateLimited = translateToolError(
    new ToolError("rate-limited", "Too many requests", "Wait"),
    () => undefined,
    common,
  );
  expect(rateLimited.message).toBe(t("runtime_rate-limited"));
  expect(rateLimited.recovery).toBe(t("runtime_rate-limited_recovery"));
  expect(rateLimited.code).toBe("rate-limited");
  const failure = new ToolError("processing-failed", "Original", "Original recovery", {
    line: 2,
    column: 4,
    messageRef: { key: "custom.failure" },
    recoveryMessage: { key: "custom.recovery" },
  });
  const translated = translateToolError(
    failure,
    ({ key }) => (key === "custom.failure" ? "उपकरण त्रुटि" : "फिर कोशिश करें"),
    common,
  );
  expect(translated.message).toBe("उपकरण त्रुटि");
  expect(translated.recovery).toBe("फिर कोशिश करें");
  expect(translated.details).toEqual(failure.details);
  const unknown = new ToolError("external-diagnostic", "Original diagnostic");
  expect(translateToolError(unknown, () => undefined, common)).toBe(unknown);
  const limited = translateToolError(
    new ToolError("input-too-large", "Too long", undefined, { values: { limit: 2000 } }),
    () => undefined,
    common,
  );
  expect(limited.message).toBe(t("runtime_input-too-large", { limit: 2000 }));
});

test("explicit error and recovery messages preserve codes and progress references across worker delivery", () => {
  const details = {
    messageRef: { key: "csv.unclosedQuote", values: { line: 2 } },
    recoveryMessage: { key: "csv.fixQuote" },
  };
  const error = new ToolError("syntax", "Unclosed quote", "Close the quote", details);
  expect(error.code).toBe("syntax");
  expect(error.details).toEqual(details);
  const progress = {
    type: "progress",
    jobId: "csv",
    completed: 2,
    total: 5,
    stage: "Reading rows",
    stageMessage: { key: "csv.processing", values: { count: 2 } },
  };
  expect(isToolWorkerResponse(progress)).toBe(true);
  expect(reduceWorkerJobState(beginWorkerJob(createToolJobState(), "csv"), progress).progress.stageMessage).toEqual(
    progress.stageMessage,
  );
  expect(parseToolErrorDetails({ messageRef: { key: "__proto__.polluted" } })).toBeUndefined();
  expect(
    parseToolErrorDetails({ messageRef: { key: "csv.error", values: { reason: { private: true } } } }),
  ).toBeUndefined();
  expect(isToolWorkerResponse({ ...progress, stageMessage: { key: "csv.error", values: { count: Infinity } } })).toBe(
    false,
  );
});
