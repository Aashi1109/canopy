"use client";

import { Fragment } from "react";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { splitPageGroups } from "./groups";

function getPlan(settings: WorkspaceProps["settings"], pageCount: number) {
  const groups = splitPageGroups(
    {
      mode: String(settings.mode ?? "every-page"),
      interval: Number(settings.interval ?? 1),
      ranges: String(settings.ranges ?? "1"),
    },
    pageCount,
  );
  return {
    title: `${groups.length} ${groups.length === 1 ? "PDF will" : "PDFs will"} be created`,
    detail: (
      <div
        className="max-h-32 overflow-y-auto text-muted-foreground"
        aria-label="Planned PDF parts"
      >
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 ? index % 2 ? " · " : <br /> : null}
            Part {String(index + 1).padStart(2, "0")}: {group.length === 1 ? "page" : "pages"}{" "}
            {group.join(", ")}
          </Fragment>
        ))}
      </div>
    ),
  };
}

export default function SplitPdfWorkspace(props: WorkspaceProps) {
  return (
    <PdfFileWorkspace
      {...props}
      definitionKey="split-pdf"
      optionsTitle="Split settings"
      getPlan={getPlan}
    />
  );
}
