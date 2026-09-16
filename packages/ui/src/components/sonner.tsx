"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-5 rounded-full bg-success p-0.5 text-success-foreground" />
        ),
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "w-[420px]! max-w-[calc(100vw-2rem)]! gap-2.5! border-0! px-4! py-[13px]! font-sans! text-sm! font-medium! shadow-[0_8px_24px_#00000026]!",
          description: "text-on-ink-muted!",
          icon: "m-0! size-5!",
          actionButton:
            "bg-transparent! px-0! font-semibold! text-on-ink-muted! hover:text-on-ink!",
        },
      }}
      style={
        {
          "--normal-bg": "var(--surface-ink, #111214)",
          "--normal-text": "var(--primary-foreground, #ffffff)",
          "--normal-border": "transparent",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { toast, Toaster };
