import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import styles from "./Assistant.module.css";

export function AssistantProgress({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <p
      role="status"
      className={
        centered
          ? "my-auto flex w-full shrink-0 flex-col items-center gap-3 py-4 text-center text-caption text-muted-foreground"
          : "flex items-center gap-2 text-caption text-muted-foreground"
      }
    >
      <LoaderCircle
        className={`${centered ? "size-6" : "size-4"} shrink-0 text-primary motion-safe:animate-spin`}
        aria-hidden="true"
      />
      <span className={centered ? undefined : styles.assistantGeneratingText}>{children}</span>
    </p>
  );
}
