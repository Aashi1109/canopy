"use client";
import { useState } from "react";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { ResultActions } from "@/components/ResultView";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ColorControl,
  Field,
  Input,
  Badge,
} from "@/components/ui/index.tsx";
import { DesignWorkspace } from "@/app/devtools/components/color-design/DesignWorkspace";
import { contrast, suggestForeground, CONTRAST_CHECKS } from "./model";
import type { ToolResult } from "@/lib/tool-framework/result";

export default function ContrastWorkspace(props: WorkspaceProps) {
  const foreground = String(props.settings.foreground ?? "#334155");
  const background = String(props.settings.background ?? "#FFFFFF");
  const canvas = String(props.settings.canvas ?? "#FFFFFF");
  const [sample, setSample] = useState("Good design is easy to read.");
  let measured: ReturnType<typeof contrast> | undefined;
  let error = "";
  try {
    measured = contrast(foreground, background, canvas);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Check your colors.";
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
      title="Text contrast"
      controlTitle="Color pair"
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
                  <p className="mt-1 text-xs text-muted-foreground">WCAG 2 contrast ratio</p>
                </div>
                <Badge variant={measured.ratio >= 4.5 ? "default" : "secondary"}>
                  {measured.ratio >= 4.5 ? "AA normal text passes" : "AA normal text fails"}
                </Badge>
              </div>
              <div
                className="rounded-xl border border-border p-6 sm:p-8"
                style={{ backgroundColor: measured.background, color: measured.foreground }}
              >
                <p className="text-2xl font-semibold leading-snug">{sample || "Good design is easy to read."}</p>
                <p className="mt-4 max-w-xl text-base leading-relaxed">
                  This is normal-size text. Check headings, descriptions, and everyday reading against the background
                  you actually use.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-3" aria-label="Contrast checks">
                {CONTRAST_CHECKS.map((check) => (
                  <div
                    key={check.label}
                    className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border pb-3 text-sm"
                  >
                    <div>
                      {check.label}
                      <span className="block text-xs text-muted-foreground">Minimum {check.minimum}:1</span>
                    </div>
                    <span
                      className={
                        measured.ratio >= check.minimum ? "font-medium text-success" : "font-medium text-destructive"
                      }
                    >
                      {measured.ratio >= check.minimum ? "Pass" : "Fail"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Large text: 24px or larger; bold text: 18.67px or larger. Pass/fail uses the full precision ratio.
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
          <ColorControl
            compact
            label="Text color"
            value={foreground}
            onChange={(value) => update("foreground", value)}
          />
          <ColorControl
            compact
            label="Background color"
            value={background}
            onChange={(value) => update("background", value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              update("foreground", background);
              update("background", foreground);
            }}
          >
            Swap text and background
          </Button>
          {measured && measured.ratio < 4.5 ? (
            <Button
              variant="outline"
              onClick={() => update("foreground", suggestForeground(foreground, background, canvas))}
            >
              Find a passing text color
            </Button>
          ) : null}
          <Accordion type="multiple" className="border-t border-border">
            <AccordionItem value="transparency-canvas">
              <AccordionTrigger>Transparency canvas · {canvas}</AccordionTrigger>
              <AccordionContent>
                <ColorControl
                  compact
                  label="Canvas behind transparency"
                  value={canvas}
                  onChange={(value) => update("canvas", value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Use an opaque color. Transparent layers are composited over this surface.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Field htmlFor="contrast-preview-text" label="Preview text">
            <Input maxLength={160} value={sample} onChange={(event) => setSample(event.target.value)} />
          </Field>
          <Button
            variant="ghost"
            onClick={() => {
              update("foreground", "#334155");
              update("background", "#FFFFFF");
              update("canvas", "#FFFFFF");
            }}
          >
            Reset colors
          </Button>
        </>
      }
    />
  );
}
