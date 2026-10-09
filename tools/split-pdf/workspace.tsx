"use client";

import { useTranslations } from "next-intl";

import { Fragment } from "react";
import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { splitPageGroups } from "./groups";

function getPlan(settings: WorkspaceProps["settings"], pageCount: number, t: ReturnType<typeof useTranslations>) {
  let groups: number[][];
  try {
    groups = splitPageGroups(
      {
        mode: String(settings.mode ?? "every-page"),
        interval: Number(settings.interval ?? 1),
        ranges: String(settings.ranges ?? "1"),
      },
      pageCount,
    );
  } catch (error) {
    throw new Error(
      t(
        error instanceof Error && "code" in error && error.code === "invalid-interval"
          ? "workspace.invalidInterval"
          : "workspace.invalidRange",
        { count: pageCount },
      ),
    );
  }
  return {
    title: t("workspace.planTitle", { count: groups.length }),
    detail: (
      <div className="max-h-32 overflow-y-auto text-muted-foreground" aria-label={t("workspace.plannedParts")}>
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 ? index % 2 ? " · " : <br /> : null}
            {t("workspace.part", {
              part: String(index + 1).padStart(2, "0"),
              count: group.length,
              pages: group.join(", "),
            })}
          </Fragment>
        ))}
      </div>
    ),
  };
}

export default function SplitPdfWorkspace(props: WorkspaceProps) {
  const t = useTranslations("Tool.runtime");
  return (
    <PdfFileWorkspace
      {...props}
      definitionKey="split-pdf"
      optionsTitle={t("workspace.splitSettings")}
      getPlan={(settings, count) => getPlan(settings, count, t)}
    />
  );
}
