"use client";

import { useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { ToolActionButton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, toast } from "@canopy/ui";
import styles from "./codeHighlight.module.css";

export function CopyBlogCode({ code }: { code: string }) {
  const [feedback, setFeedback] = useState<{ code: string; status: "copied" | "failed" } | null>(null);
  const status = feedback?.code === code ? feedback.status : null;
  const label = status === "copied" ? "Copied" : status === "failed" ? "Retry copying code" : "Copy code";

  async function copy() {
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ code, status: "copied" });
    } catch {
      setFeedback({ code, status: "failed" });
      toast.error("Couldn't copy. Select the code and copy it manually, or try again.");
    }
  }

  return (
    <div className={styles.copyControl} contentEditable={false} data-feedback={status ?? undefined}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolActionButton
              action="copy"
              iconOnly
              className="bg-muted"
              type="button"
              aria-label={label}
              icon={
                status === "copied" ? (
                  <Check aria-hidden="true" />
                ) : status === "failed" ? (
                  <CircleAlert aria-hidden="true" />
                ) : undefined
              }
              onClick={() => void copy()}
            >
              {label}
            </ToolActionButton>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span role="status" className="sr-only">
        {status === "copied"
          ? "Code copied to clipboard."
          : status === "failed"
            ? "Couldn't copy. Select the code and copy it manually, or try again."
            : ""}
      </span>
    </div>
  );
}
