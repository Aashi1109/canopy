"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/components/alert-dialog";
import { toast, Toaster } from "@/components/ui/components/toast";

type Feedback = {
  notify: (message: string, tone?: "success" | "error" | "info") => void;
  confirm: (message: string) => Promise<boolean>;
};

const notify: Feedback["notify"] = (message, tone = "success") => {
  toast[tone](message);
};
const FeedbackContext = createContext<Feedback>({ notify, confirm: async () => false });

export function usePaperworkFeedback() {
  return useContext(FeedbackContext);
}

export function PaperworkFeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Tool.runtime");
  const [message, setMessage] = useState<string | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const finish = useCallback((confirmed: boolean) => {
    resolve.current?.(confirmed);
    resolve.current = null;
    setMessage(null);
  }, []);
  const confirm = useCallback(
    (text: string) =>
      new Promise<boolean>((done) => {
        resolve.current?.(false);
        resolve.current = done;
        setMessage(text);
      }),
    [],
  );
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <Toaster />
      <AlertDialog
        open={message !== null}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shared.feedback.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>{t("shared.feedback.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => finish(true)}>{t("shared.feedback.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeedbackContext.Provider>
  );
}
