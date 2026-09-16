"use client";

/**
 * The generator layout, plus the one thing the shared surfaces cannot express:
 * the gradient itself. `run.ts` returns a `background:` declaration as text, so
 * the default result pane shows the CSS and nothing else — for a gradient tool
 * that is the whole point of the output.
 *
 * The declaration is parsed back out of the result rather than rebuilt from the
 * settings so there is one source of truth for the gradient, and so the swatch
 * can only show a value `run.ts` already validated both colours for.
 */

import { ToolOptionsPanel } from "@smarttools/ui";

import { ResultSurface } from "@/components/ResultSurface";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SplitStack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { WorkspaceInputSurface } from "@/components/WorkspaceInput";
import type { ToolResult } from "@/lib/tool-framework/result";

/** The CSS value from a `background: <value>;` declaration, or "" when absent. */
function gradientValue(result: ToolResult | null): string {
  if (!result || result.render !== "text") return "";
  return /background:\s*(.+);\s*$/.exec(result.text)?.[1] ?? "";
}

export default function GradientGeneratorWorkspace(props: WorkspaceProps) {
  const gradient = gradientValue(props.result);

  return (
    <SplitStack className="h-full" defaultSize={75} minSize={75}>
      <SplitStack className="h-full max-[64rem]:h-[34rem]" defaultSize={48} minSize={28} orientation="vertical">
        <WorkspaceInputSurface
          disabled={props.disabled}
          input={props.input}
          inputSpec={props.spec.input}
          onInputChange={props.onInputChange}
        />
        <ResultSurface
          error={props.error}
          result={props.result}
          running={props.running}
          spec={props.spec}
          title="Generated result"
        />
      </SplitStack>
      <SplitStack
        className="h-full max-[64rem]:h-[42rem]"
        collapseLabel="settings panel"
        collapseSide="secondary"
        collapsible
        defaultCollapsed="secondary"
        defaultSize={48}
        minSize={28}
        orientation="vertical"
      >
        <WorkspaceSurface
          className="h-full"
          contentClassName="p-4"
          purpose="preview"
          state={gradient ? "ready" : "empty"}
          stateDescription="Enter two valid HEX colours to preview the blend."
          stateTitle="Gradient preview"
          title="Preview"
        >
          <div
            aria-label="Generated gradient preview"
            className="min-h-40 flex-1 rounded-lg border border-border"
            role="img"
            style={{ backgroundImage: gradient }}
          />
        </WorkspaceSurface>
        <ToolOptionsPanel
          className="h-full overflow-y-auto bg-card p-[22px]"
          title={props.spec.input.kind === "fields" ? props.spec.input.label : "Generator settings"}
          variant="plain"
        >
          <SettingsPanel
            disabled={props.disabled}
            onChange={props.onSettingChange}
            spec={props.spec.settings}
            values={props.settings}
          />
        </ToolOptionsPanel>
      </SplitStack>
    </SplitStack>
  );
}
