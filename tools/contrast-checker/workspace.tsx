"use client";
import { useTranslations as useToolTranslations } from "next-intl";
import { ArrowDownUp } from "lucide-react";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { ResultActions } from "@/components/ResultView";
import {
  Badge,
  Button,
  ColorControl,
  InlineTextEditor,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { contrast, suggestForeground, CONTRAST_CHECKS } from "./model";
import type { ToolResult } from "@/lib/tool-framework/result";

export default function ContrastWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const foreground = String(props.settings.foreground ?? "#334155");
  const background = String(props.settings.background ?? "#FFFFFF");
  const canvas = String(props.settings.canvas ?? "#FFFFFF");
  const sample = String(props.settings.sample ?? "Good design is easy to read.");
  const bodySample = String(
    props.settings.bodySample ??
      "This is normal-size text. Check headings, descriptions, and everyday reading against the background you actually use.",
  );
  let measured: ReturnType<typeof contrast> | undefined;
  let error = "";
  try {
    measured = contrast(foreground, background, canvas);
  } catch (cause) {
    error =
      cause instanceof Error && "code" in cause && cause.code === "canvas"
        ? toolText("workspace.opaqueCanvas")
        : toolText("workspace.invalidColor");
  }
  const update = (key: string, value: string) => props.onSettingChange(key, value);
  const report: ToolResult | null =
    props.result?.render === "key-value"
      ? {
          render: "text",
          text: props.result.entries.map((entry) => `${entry.label}: ${entry.value}`).join("\n"),
          downloadName: "contrast-report.txt",
        }
      : null;
  return (
    <DesignWorkspace
      title={toolText("workspace.text_contrast_8cdead")}
      controlTitle={toolText("workspace.colorPair")}
      previewActions={
        <ResultActions
          result={report}
          canCopy={Boolean(props.result) && !props.running && !error}
          canDownload={Boolean(props.result) && !props.running && !error}
        />
      }
      preview={
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          {measured ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
                <div>
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    {measured.ratio.toFixed(2)}
                    <span className="text-lg text-muted-foreground"> : 1</span>
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{toolText("workspace.wcag_2_contrast_2df30a")}</p>
                </div>
                <Badge variant={measured.ratio >= 4.5 ? "default" : "secondary"}>
                  {measured.ratio >= 4.5
                    ? toolText("workspace.aa_normal_text_feedfb")
                    : toolText("workspace.aa_normal_text_155fc3")}
                </Badge>
              </div>
              <div
                className="rounded-xl border border-border p-6 sm:p-8"
                style={{ backgroundColor: measured.background, color: measured.foreground }}
              >
                <p className="text-2xl font-semibold leading-snug">
                  <InlineTextEditor
                    label={toolText("workspace.preview_heading_4a0861")}
                    value={sample}
                    onChange={(value) => update("sample", value)}
                    multiline
                    required
                    maxLength={160}
                  />
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed">
                  <InlineTextEditor
                    label={toolText("workspace.preview_body_text_46356b")}
                    value={bodySample}
                    onChange={(value) => update("bodySample", value)}
                    multiline
                    required
                    maxLength={1000}
                  />
                </p>
              </div>
              <div
                className="grid grid-cols-2 gap-x-5 gap-y-3"
                aria-label={toolText("workspace.contrast_checks_06afb9")}
              >
                {CONTRAST_CHECKS.map((check) => (
                  <div
                    key={toolText(`workspace.checks.${CONTRAST_CHECKS.indexOf(check)}`)}
                    className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border pb-3 text-sm"
                  >
                    <div>
                      {toolText(`workspace.checks.${CONTRAST_CHECKS.indexOf(check)}`)}
                      <span className="block text-xs text-muted-foreground">
                        {toolText("workspace.minimumRatio", { value: check.minimum })}
                      </span>
                    </div>
                    <span
                      className={
                        measured.ratio >= check.minimum ? "font-medium text-success" : "font-medium text-destructive"
                      }
                    >
                      {measured.ratio >= check.minimum
                        ? toolText("workspace.pass_ebdf8c")
                        : toolText("workspace.fail_09230b")}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {toolText("workspace.large_text_24px_61dfed")}
              </p>
            </>
          ) : (
            <p role="status" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      }
      controls={
        <>
          <div className="flex flex-col gap-2">
            <ColorControl
              layout="inline"
              label={toolText("workspace.text_color_4a69d0")}
              value={foreground}
              onChange={(value) => update("foreground", value)}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="self-center"
                    aria-label={toolText("workspace.swap_text_and_ead1c1")}
                    onClick={() => {
                      update("foreground", background);
                      update("background", foreground);
                    }}
                  >
                    <ArrowDownUp aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{toolText("workspace.swap_text_and_ead1c1")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ColorControl
              layout="inline"
              label={toolText("workspace.background_color_3e314d")}
              value={background}
              onChange={(value) => update("background", value)}
            />
          </div>
          {measured && measured.ratio < 4.5 ? (
            <Button
              variant="outline"
              onClick={() => update("foreground", suggestForeground(foreground, background, canvas))}
            >
              {toolText("workspace.find_a_passing_0f1b5c")}
            </Button>
          ) : null}
          <div>
            <ColorControl
              layout="inline"
              label={toolText("workspace.canvas_behind_transparency_1dcdfd")}
              value={canvas}
              onChange={(value) => update("canvas", value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">{toolText("workspace.use_an_opaque_e39511")}</p>
          </div>
        </>
      }
    />
  );
}
