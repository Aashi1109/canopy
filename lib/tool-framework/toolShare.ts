import type { FieldSpec } from "./settings";
import type { ToolSpec } from "./spec";

export type ToolShareState = {
  readonly input: { readonly text: string; readonly secondary?: string };
  readonly settings: Readonly<Record<string, unknown>>;
};

export const MAX_SHARE_URL_LENGTH = 4096;

const PREFIX = "#share=";
const INVALID = "This shared link contains invalid inputs or settings. Enter your values again.";
const TOO_LARGE = "These inputs are too large to share as a link. Shorten them and try again.";
const UNSUPPORTED = "This tool does not support sharing these inputs or settings.";
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null || prototype === Object.prototype) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === "string" && !RESERVED_KEYS.has(key) && "value" in Object.getOwnPropertyDescriptor(value, key)!,
    )
  );
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function validSetting(field: FieldSpec, value: unknown): boolean {
  switch (field.kind) {
    case "text":
      return typeof value === "string" && value.length <= (field.maxLength ?? MAX_SHARE_URL_LENGTH);
    case "toggle":
      return typeof value === "boolean";
    case "select":
      return typeof value === "string" && field.choices.some((choice) => choice.value === value);
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (field.min !== undefined && value < field.min) return false;
      if (field.max !== undefined && value > field.max) return false;
      if (field.step !== undefined) {
        const steps = (value - (field.min ?? 0)) / field.step;
        if (!Number.isFinite(steps) || Math.abs(steps - Math.round(steps)) > 1e-8) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

function validateState(spec: ToolSpec, value: unknown): { state: ToolShareState } | { error: string } {
  if (
    !spec.sharing ||
    !Number.isSafeInteger(spec.sharing.version) ||
    spec.sharing.version < 1 ||
    spec.input.kind === "files" ||
    (spec.input.kind === "fields" && spec.input.fields.some((field) => field.secret)) ||
    Object.values(spec.settings.fields).some((field) => !["text", "number", "select", "toggle"].includes(field.kind))
  ) {
    return { error: UNSUPPORTED };
  }
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, ["input", "settings"]) ||
    !isPlainRecord(value.input) ||
    !hasOnlyKeys(value.input, ["text", "secondary"]) ||
    !isPlainRecord(value.settings)
  ) {
    return { error: INVALID };
  }
  const input = value.input;
  const settings = value.settings;
  if (typeof input.text !== "string") return { error: INVALID };
  const secondaryAllowed =
    spec.input.kind === "text"
      ? !!spec.input.secondary
      : spec.input.kind === "fields" && spec.input.fields.some((field) => field.channel === "secondary");
  if (Object.hasOwn(input, "secondary") && (!secondaryAllowed || typeof input.secondary !== "string")) {
    return { error: INVALID };
  }
  if (
    input.text.length > MAX_SHARE_URL_LENGTH ||
    (typeof input.secondary === "string" && input.secondary.length > MAX_SHARE_URL_LENGTH)
  ) {
    return { error: TOO_LARGE };
  }
  if (spec.input.kind === "none" && input.text !== "") return { error: INVALID };
  if (spec.input.kind === "text" && spec.input.required !== false && !input.text.trim()) return { error: INVALID };
  if (spec.input.kind === "text" && spec.input.maxLength !== undefined && input.text.length > spec.input.maxLength) {
    return { error: INVALID };
  }
  if (spec.input.kind === "fields") {
    if (!spec.input.fields.some((field) => field.channel === "text") && input.text !== "") return { error: INVALID };
    for (const field of spec.input.fields) {
      const text = input[field.channel];
      if (
        (field.required && (typeof text !== "string" || !text.trim())) ||
        (typeof text === "string" && field.maxLength !== undefined && text.length > field.maxLength)
      ) {
        return { error: INVALID };
      }
    }
  }
  const keys = Object.keys(spec.settings.fields);
  if (
    !hasOnlyKeys(settings, keys) ||
    keys.some(
      (key) =>
        RESERVED_KEYS.has(key) ||
        !Object.hasOwn(settings, key) ||
        !validSetting(spec.settings.fields[key], settings[key]),
    )
  )
    return { error: INVALID };

  return {
    state: {
      input: { text: input.text, ...(typeof input.secondary === "string" ? { secondary: input.secondary } : {}) },
      settings: Object.fromEntries(keys.map((key) => [key, settings[key]])),
    },
  };
}

/** Call with every effective setting, including defaults; encoding never coerces or drops values. */
export function encodeToolShare(spec: ToolSpec, state: ToolShareState): { hash: string } | { error: string } {
  const validated = validateState(spec, state);
  if ("error" in validated) return validated;
  const hash =
    PREFIX +
    encodeURIComponent(
      JSON.stringify({
        v: 1,
        tool: spec.toolId,
        revision: spec.sharing!.version,
        ...validated.state,
      }),
    );
  return hash.length > MAX_SHARE_URL_LENGTH ? { error: TOO_LARGE } : { hash };
}

/** Unrelated fragments remain available to the page's normal anchor navigation. */
export function decodeToolShare(spec: ToolSpec, hash: string): { state: ToolShareState } | { error: string } | null {
  if (!hash.startsWith(PREFIX)) return null;
  if (hash.length > MAX_SHARE_URL_LENGTH) return { error: TOO_LARGE };
  let payload: unknown;
  try {
    payload = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length)));
  } catch {
    return { error: INVALID };
  }
  if (!isPlainRecord(payload) || !hasOnlyKeys(payload, ["v", "tool", "revision", "input", "settings"])) {
    return { error: INVALID };
  }
  if (payload.v !== 1 || payload.tool !== spec.toolId || !spec.sharing || payload.revision !== spec.sharing.version) {
    return { error: "This shared link is incompatible with this tool. Create a new link with the current version." };
  }
  return validateState(spec, { input: payload.input, settings: payload.settings });
}
