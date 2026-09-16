/**
 * Moved verbatim from the `json-schema-validator` case in
 * `lib/devtools/format-json.ts`, together with its `validateJsonSchema`
 * helper — this tool is that helper's only consumer, so it lives here rather
 * than in `lib/devtools/shared/`.
 */

import type { ToolRun } from "../../lib/tool-framework/run.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import { jsonType, parseStrictJson } from "../../lib/devtools/shared/json-input.ts";
import { isRecord } from "../../lib/devtools/shared/json.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

function validateJsonSchema(value: unknown, schema: unknown, path = "$"): string[] {
  if (!isRecord(schema)) return [`${path}: schema must be an object`];
  const errors: string[] = [];
  const expected = schema.type;
  const actual = jsonType(value);
  const matchesType =
    expected === undefined ||
    expected === actual ||
    (expected === "integer" && typeof value === "number" && Number.isInteger(value));
  if (!matchesType) return [`${path}: expected ${String(expected)}, received ${actual}`];
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${path}: value is not in enum`);
  }
  if (isRecord(value)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in value)) errors.push(`${path}.${key}: is required`);
      }
    }
    if (isRecord(schema.properties)) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (key in value) errors.push(...validateJsonSchema(value[key], childSchema, `${path}.${key}`));
      }
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchema(item, schema.items, `${path}[${index}]`));
    });
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: must contain at least ${schema.minLength} characters`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: must contain at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match pattern`);
      } catch {
        errors.push(`${path}: schema pattern is invalid`);
      }
    }
  }
  return errors;
}

export const run: ToolRun<Settings> = (ctx): ToolResult => {
  const errors = validateJsonSchema(
    parseStrictJson(ctx.input.text, "JSON data"),
    parseStrictJson(ctx.input.secondary ?? "", "JSON schema"),
  );
  return {
    render: "text",
    text: errors.length ? `Invalid\n${errors.map((error) => `- ${error}`).join("\n")}` : "Valid against schema.",
    verdict: errors.length
      ? {
          level: "error",
          label: "Invalid",
          detail: `${errors.length} problem${errors.length === 1 ? "" : "s"}`,
        }
      : { level: "ok", label: "Valid against schema" },
  };
};

export default run;
