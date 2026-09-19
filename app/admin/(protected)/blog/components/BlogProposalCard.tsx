"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/index.tsx";
import styles from "./BlogProposalCard.module.css";

type Props = {
  kind: "insert" | "replace" | "delete";
  title: string;
  placement: string;
  before: string;
  after: string;
  compact: boolean;
  actionable: boolean;
  stale: boolean;
  actionLabel: string;
  onApply: () => void;
  onDiscard: () => void;
};

/** Shared compact, summary and expanded section proposal from the assistant designs. */
export function BlogProposalCard({
  kind,
  title,
  placement,
  before,
  after,
  compact,
  actionable,
  stale,
  actionLabel,
  onApply,
  onDiscard,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const detailed = expanded || !compact;
  const excerpt = kind === "delete" ? before : after;
  const wordCount = excerpt.trim().split(/\s+/).filter(Boolean).length;
  const badge = (
    <span className={`${styles.badge} rounded-full`} data-kind={kind}>
      {kind === "insert" ? "NEW SECTION" : kind === "delete" ? "DELETE" : "EDIT"}
    </span>
  );
  const toggleButton = (
    <Button
      ref={toggle}
      variant="link"
      size="xs"
      className={styles.toggle}
      aria-expanded={expanded}
      aria-controls={previewId}
      onClick={() => setExpanded((value) => !value)}
    >
      {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      {expanded ? "Hide" : compact ? "Show change" : "Show full change"}
    </Button>
  );
  function act(action: () => void) {
    action();
    requestAnimationFrame(() => toggle.current?.focus());
  }
  return (
    <section aria-label={title} className={styles.card} data-detailed={detailed}>
      <div className={styles.header}>
        {detailed ? badge : <h4 className={styles.title}>{title}</h4>}
        {actionable && (
          <TooltipProvider>
            <div className={styles.actions}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-xs" aria-label="Discard proposal" onClick={() => act(onDiscard)}>
                    <X aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Discard proposal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={stale ? 0 : undefined} className={styles.actionTarget}>
                    <Button size="icon-xs" aria-label={actionLabel} disabled={stale} onClick={() => act(onApply)}>
                      <Check aria-hidden="true" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {stale ? "This section changed. Ask for a fresh suggestion." : actionLabel}
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </div>
      {detailed ? (
        <>
          <div className={styles.summary}>
            <h4 className={styles.title}>{title}</h4>
            <p className={styles.facts}>
              {[actionable && "Not applied", placement, `${wordCount} ${wordCount === 1 ? "word" : "words"}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {!expanded && <p className={styles.excerpt}>{excerpt}</p>}
        </>
      ) : null}
      <div id={previewId} hidden={!expanded} className={styles.diff}>
        {kind !== "insert" && before && (
          <div className={styles.removed}>
            <span aria-hidden="true" className={styles.marker}>
              −
            </span>
            <p>
              <span className="sr-only">Removed text: </span>
              {before}
            </p>
          </div>
        )}
        {kind !== "delete" && after && (
          <div className={styles.added}>
            <span aria-hidden="true" className={styles.marker}>
              +
            </span>
            <p>
              <span className="sr-only">Added text: </span>
              {after}
            </p>
          </div>
        )}
      </div>
      {actionable && stale && <p className={styles.facts}>This section changed. Ask for a fresh suggestion.</p>}
      <div className={styles.footer}>
        {!detailed && (
          <>
            {badge}
            <p className={styles.placement}>{placement}</p>
          </>
        )}
        {toggleButton}
      </div>
    </section>
  );
}
