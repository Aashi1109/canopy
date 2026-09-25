"use client";

import { useId } from "react";

import { ResultSurface } from "@/components/ResultSurface";
import { CopyButton } from "@/components/ResultView";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { Button, ColorSwatch, Field } from "@/components/ui/index.tsx";
import { parseColor, rgbToHex } from "@/lib/devtools/shared/color";
import type { ToolResult } from "@/lib/tool-framework/result";
import { DesignWorkspace } from "./DesignWorkspace";
import { ColorValueList } from "./ColorValueList";
import { ColorChipInput } from "./ColorChipInput";

function swatch(value: string, outputFunction?: "rgb" | "hsl"): string | undefined {
  for (const candidate of [value, ...(outputFunction ? [`${outputFunction}(${value})`] : [])]) {
    try {
      return rgbToHex(parseColor(candidate));
    } catch {
      /* Bare channel output needs its function wrapper. */
    }
  }
}

/** Reuses runtime results and copy actions; adds source-associated visual output. */
export default function ColorConversionWorkspace({
  inputFormat = "hex",
  outputFunction,
  ...props
}: WorkspaceProps & { inputFormat?: "hex" | "rgb" | "any"; outputFunction?: "rgb" | "hsl" }) {
  const id = useId();
  const label = inputFormat === "hex" ? "HEX colors" : inputFormat === "rgb" ? "RGB colors" : "Colors";
  const example =
    inputFormat === "rgb" ? "rgb(51 102 255 / 50%)" : inputFormat === "hex" ? "#3366ff80" : "rebeccapurple";
  const lines = props.input.text
    .split(/\r\n?|\n/)
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter(({ value }) => value);
  const renderResult = (result: ToolResult) => {
    const items = result.render === "list" ? result.items : result.render === "text" ? [result.text] : [];
    const labels = result.render === "list" ? result.labels : [lines[0]?.value];
    if (result.render === "key-value") {
      return <ColorValueList entries={result.entries} disabled={Boolean(props.running || props.error)} />;
    }
    return (
      <div className="min-h-0 overflow-y-auto">
        {result.render === "list" ? (
          <p className="px-4 py-2 text-xs text-muted-foreground" role="status">
            {items.length} converted · {result.issues?.length ?? 0} invalid. Copy all includes successful values only.
          </p>
        ) : null}
        {items.map((value, index) => {
          const color = swatch(value, outputFunction);
          return (
            <div
              className="flex min-w-0 items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
              key={`${index}-${labels?.[index]}`}
            >
              {color ? <ColorSwatch className="size-10 shrink-0" color={color} /> : null}
              <div className="min-w-0 flex-1">
                {result.render === "list" ? (
                  <p className="truncate text-xs text-muted-foreground">{labels?.[index]}</p>
                ) : null}
                <code className="whitespace-pre-wrap break-all text-sm">
                  <SyntaxHighlight code={value} language="css" />
                </code>
              </div>
              <CopyButton
                disabled={Boolean(props.running || props.error)}
                content={value}
                label={`Copy color ${index + 1}`}
                iconOnly
              />
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <DesignWorkspace
      title="Source colors"
      controlTitle="Output options"
      preview={
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <Field
            error={
              props.error ??
              (props.result?.issues?.length ? (
                <ul aria-label="Invalid colors">
                  {props.result.issues.map((issue, index) => (
                    <li key={index}>
                      Color {lines.findIndex(({ line }) => line === issue.line) + 1}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : undefined)
            }
            htmlFor={`${id}-source`}
            label={label}
            description="Press Enter to add a color, or paste one per line. Click a circle to pick a color; click its value to edit."
          >
            <ColorChipInput
              inputFormat={inputFormat}
              disabled={props.disabled}
              id={`${id}-source`}
              onValueChange={(text) => props.onInputChange({ ...props.input, text })}
              placeholder={example}
              value={props.input.text}
            />
          </Field>
          {!lines.length ? (
            <Button
              className="self-start"
              disabled={props.disabled}
              onClick={() => props.onInputChange({ ...props.input, text: example })}
              size="sm"
              variant="outline"
            >
              Try a color
            </Button>
          ) : null}
        </div>
      }
      controls={
        <SettingsPanel
          disabled={props.disabled}
          onChange={props.onSettingChange}
          spec={props.spec.settings}
          values={props.settings}
        />
      }
      output={
        <ResultSurface
          error={props.error}
          renderResult={renderResult}
          renderResultActions={(result) => {
            const content =
              result.render === "list" ? result.items.join("\n") : result.render === "text" ? result.text : "";
            return (
              <CopyButton
                content={content}
                disabled={!content}
                iconOnly
                label={result.render === "list" ? "Copy all successful values" : "Copy result"}
              />
            );
          }}
          result={props.running || props.error ? null : props.result}
          retainedResult={props.result}
          running={props.running}
          spec={props.spec}
          title="Converted colors"
        />
      }
    />
  );
}
