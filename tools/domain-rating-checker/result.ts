import type { ToolResult, ToolTextRender } from "../../lib/tool-framework/result.ts";

export type DomainRatingResult = ToolTextRender & {
  readonly domainRating: {
    readonly target: string;
    readonly score: number;
    readonly license: string;
    readonly warning: string | null;
  };
};

export function readDomainRating(result: ToolResult): DomainRatingResult["domainRating"] | null {
  if (result.render !== "text" || !("domainRating" in result)) return null;
  const rating = result.domainRating;
  if (
    typeof rating !== "object" ||
    rating === null ||
    !("target" in rating) ||
    typeof rating.target !== "string" ||
    !rating.target.trim() ||
    !("score" in rating) ||
    typeof rating.score !== "number" ||
    !Number.isFinite(rating.score) ||
    rating.score < 0 ||
    rating.score > 100 ||
    !("license" in rating) ||
    typeof rating.license !== "string" ||
    !rating.license.trim() ||
    !("warning" in rating) ||
    (rating.warning !== null && typeof rating.warning !== "string")
  ) {
    return null;
  }
  return { target: rating.target, score: rating.score, license: rating.license, warning: rating.warning };
}
