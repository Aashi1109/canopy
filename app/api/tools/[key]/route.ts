/**
 * The server execution host. It knows nothing about any individual tool: the
 * folder key arrives in the URL, and the two dynamic imports below are bundler
 * context modules over `tools/*` — the static prefix and suffix let the bundler
 * emit one chunk per folder. There is no map and no registry.
 *
 * A route handler rather than a server action on purpose: an action cannot be
 * resolved dynamically without pulling every tool's server module into the
 * client graph, which is exactly what `run.server.ts` exists to prevent.
 */

import { TOOL_SLUG_PATTERN } from "@smarttools/tool-catalog";
import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rateLimit";
import type { ToolResult } from "@/lib/tool-framework/result";
import { ToolError, type ToolRun } from "@/lib/tool-framework/run";
import { parseSettings } from "@/lib/tool-framework/settings";
import type { ToolSpec } from "@/lib/tool-framework/spec";

type ToolRequestBody = {
  readonly text?: unknown;
  readonly secondary?: unknown;
  readonly settings?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSpec(module: unknown): ToolSpec {
  const spec = isRecord(module) ? module.default : null;
  if (!isRecord(spec) || !isRecord(spec.settings)) {
    throw new ToolError("unknown-tool", "This tool is not available.");
  }
  return spec as unknown as ToolSpec;
}

function readRun(module: unknown): ToolRun<never> {
  const run = isRecord(module) ? module.run : null;
  if (typeof run !== "function") {
    throw new ToolError("unknown-tool", "This tool is not available.");
  }
  return run as ToolRun<never>;
}

/** Never leaks a stack trace, a module path, or an internal message. */
function toFailure(error: unknown): NextResponse {
  if (error instanceof ToolError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          recovery: error.recovery,
        },
      },
      { status: error.code === "unknown-tool" ? 404 : 400 },
    );
  }
  return NextResponse.json(
    {
      error: {
        code: "processing-failed",
        message: "This tool could not finish. The input may be malformed or unsupported.",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }): Promise<NextResponse> {
  try {
    const { key } = await params;
    // `key` is untrusted and is about to become part of a module path.
    if (!TOOL_SLUG_PATTERN.test(key)) {
      throw new ToolError("unknown-tool", "This tool is not available.");
    }

    // This header is spoofable unless a trusted proxy overwrites it. Taking
    // only the first hop makes this a quota speed bump, not authorization.
    const clientKey = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown-client";
    const rateLimit = checkRateLimit(`${key}:${clientKey}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "rate-limited",
            message: "Too many requests. Please try again shortly.",
            recovery: "Wait before running this tool again.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    let body: ToolRequestBody;
    try {
      body = (await request.json()) as ToolRequestBody;
    } catch {
      throw new ToolError("invalid-request", "Request body must be JSON.");
    }
    if (!isRecord(body)) {
      throw new ToolError("invalid-request", "Request body must be JSON.");
    }

    let modules: readonly [unknown, unknown];
    try {
      modules = await Promise.all([
        import(`../../../../tools/${key}/definition`),
        import(`../../../../tools/${key}/run.server`),
      ]);
    } catch {
      throw new ToolError("unknown-tool", "This tool is not available.");
    }

    const spec = readSpec(modules[0]);
    const run = readRun(modules[1]);

    const result: ToolResult = await run({
      input: {
        text: typeof body.text === "string" ? body.text : "",
        secondary: typeof body.secondary === "string" ? body.secondary : undefined,
        files: [],
      },
      settings: parseSettings(spec.settings, body.settings) as never,
      signal: request.signal,
      progress: () => {},
      writeArtifact: async () => {
        throw new ToolError("artifact-unsupported", "This server-hosted tool cannot create a browser-local artifact.");
      },
    });

    return NextResponse.json({ result });
  } catch (error) {
    return toFailure(error);
  }
}
