export type AIErrorCode =
  "CONFIGURATION" | "CAPABILITY" | "VALIDATION" | "RATE_LIMIT" | "PROVIDER" | "CANCELLED" | "INVALID_OUTPUT";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };

  constructor(code: AIErrorCode, message: string, status = 502, retryable = false, options?: ErrorOptions) {
    super(message, options);
    this.name = "AIError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function normalizeAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  const failure = (code: AIErrorCode, message: string, status = 502, retryable = false) =>
    new AIError(code, message, status, retryable, { cause: error });
  if (
    error instanceof Error &&
    [
      "AI_NoObjectGeneratedError",
      "AI_NoOutputGeneratedError",
      "AI_TypeValidationError",
      "AI_JSONParseError",
      "AI_InvalidToolInputError",
      "AI_NoSuchToolError",
    ].includes(error.name)
  ) {
    return failure("INVALID_OUTPUT", "The AI provider returned an invalid or unsupported result. Try again.");
  }
  const details =
    typeof error === "object" && error !== null ? (error as { status?: unknown; statusCode?: unknown }) : {};
  const status = typeof details.status === "number" ? details.status : details.statusCode;
  if (status === 429) return failure("RATE_LIMIT", "The AI provider is busy. Try again shortly.", 429, true);
  if (status === 401 || status === 403)
    return failure("CONFIGURATION", "The AI provider is not available with the current configuration.", 503);
  if (status === 400 || status === 422)
    return failure(
      "VALIDATION",
      "The AI provider could not accept this request. Check its inputs and supported options.",
      400,
    );
  if (error instanceof Error && error.name === "AbortError")
    return failure("CANCELLED", "The AI request was cancelled.", 409);

  return failure("PROVIDER", "The AI request failed. Try again.", 502, true);
}
