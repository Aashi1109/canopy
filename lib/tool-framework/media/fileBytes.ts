import type { ToolRunFile } from "../run.ts";

/**
 * Full buffering is deliberately worker-local and only used by codecs that
 * require contiguous input. Completed reads are not cached: retaining the
 * promise also retains its full ArrayBuffer for as long as the source File.
 */
export async function readToolFile(file: ToolRunFile, signal?: AbortSignal): Promise<ArrayBuffer> {
  signal?.throwIfAborted();
  const buffer = await file.source.arrayBuffer();
  signal?.throwIfAborted();
  return buffer;
}
