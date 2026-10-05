"use client";

import { DirectionProvider as BaseDirectionProvider } from "@base-ui/react/direction-provider";
import { Direction } from "radix-ui";
import type { ReactNode } from "react";

export function DirectionProvider({ dir, children }: { dir: "ltr" | "rtl"; children: ReactNode }) {
  return (
    <Direction.Provider dir={dir}>
      <BaseDirectionProvider direction={dir}>{children}</BaseDirectionProvider>
    </Direction.Provider>
  );
}
