"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssistantRun } from "@/lib/assistant/types";
import { activeRun, assistantRequest } from "@/lib/assistant/client";
import { BlogGenerationProgress } from "./BlogGenerationProgress";

/** Reopened drafts read saved state only; they never recreate a stream or execution. */
export function BlogGenerationRecovery({ initialRun }: { initialRun: AssistantRun & { canManage?: boolean } }) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const lock = useRef(false);
  async function refresh() {
    if (lock.current || transitionPending) return;
    lock.current = true;
    setRefreshing(true);
    try {
      if (run.canManage === false) {
        startTransition(() => router.refresh());
        return;
      }
      const result = await assistantRequest<{ run: AssistantRun }>(
        `/api/assistant/blog/runs/${encodeURIComponent(run.id)}`,
      );
      setRun(result.run);
      setError("");
      if (result.run.status === "completed") startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check status. Try again.");
    } finally {
      lock.current = false;
      setRefreshing(false);
    }
  }
  return (
    <BlogGenerationProgress
      run={run}
      brief={run.canManage === false ? "An article is being generated for this draft." : run.request.message}
      streaming={false}
      refreshing={refreshing || transitionPending}
      error={error || run.errorMessage || undefined}
      onRefresh={() => void refresh()}
      onEdit={
        !activeRun(run.status) && run.resourceId
          ? () => router.replace(`/admin/blog/${encodeURIComponent(run.resourceId!)}?edit=1`)
          : undefined
      }
      onRetry={
        run.canManage !== false && !activeRun(run.status)
          ? () => router.push(`/admin/blog/new?mode=ai&run=${encodeURIComponent(run.id)}`)
          : undefined
      }
    />
  );
}
