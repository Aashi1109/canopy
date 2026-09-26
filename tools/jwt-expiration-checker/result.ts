import { isRecord } from "../../lib/devtools/shared/json.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";

export type JwtExpirationSummary = {
  readonly state: "active" | "expired" | "not-active" | "expiring-soon" | "no-expiration";
  readonly checkedAt: number;
  readonly expiresAt: number | null;
  readonly issuedAt: number | null;
  readonly notBefore: number | null;
  readonly useLocalTime: boolean;
  readonly payload?: Record<string, unknown>;
};

export type JwtExpirationResult = Extract<ToolResult, { render: "text" }> & {
  readonly jsonPreview: { readonly render: "json-tree"; readonly value: JwtExpirationSummary };
};

/** NumericDate seconds that can be displayed without overflowing a JavaScript Date. */
export function isNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000;
}

export function getExpirationSummary(result: ToolResult | null | undefined): JwtExpirationSummary | null {
  const value =
    result?.render === "text" && result.jsonPreview?.render === "json-tree" ? result.jsonPreview.value : undefined;
  if (!isRecord(value)) return null;
  const { state, checkedAt, expiresAt, issuedAt, notBefore, useLocalTime, payload } = value;
  if (
    (state !== "active" &&
      state !== "expired" &&
      state !== "not-active" &&
      state !== "expiring-soon" &&
      state !== "no-expiration") ||
    !isNumericDate(checkedAt) ||
    (expiresAt !== null && !isNumericDate(expiresAt)) ||
    (issuedAt !== null && !isNumericDate(issuedAt)) ||
    (notBefore !== null && !isNumericDate(notBefore)) ||
    typeof useLocalTime !== "boolean" ||
    (payload !== undefined && !isRecord(payload))
  ) {
    return null;
  }
  return {
    state,
    checkedAt,
    expiresAt,
    issuedAt,
    notBefore,
    useLocalTime,
    ...(payload === undefined ? {} : { payload }),
  };
}
