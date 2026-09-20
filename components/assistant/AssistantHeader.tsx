import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/index.tsx";
import styles from "./Assistant.module.css";

export function AssistantHeader({
  title,
  children,
  onClose,
  closeLabel,
}: {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
  closeLabel: string;
}) {
  return (
    <div className={styles.assistantPanelHeader}>
      <h2 className={styles.assistantHeading}>{title}</h2>
      <div className={styles.assistantHeaderActions}>
        {children}
        {onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={closeLabel} onClick={onClose}>
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{closeLabel} (Escape)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
