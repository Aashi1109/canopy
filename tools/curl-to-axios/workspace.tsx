"use client";

import { useEffect, useId } from "react";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { FieldLabel, SegmentedControl, Select, toast } from "@/components/ui/index.tsx";

const REQUEST_STYLES = [
  { label: "axios.request", value: "request" },
  { label: "Aliases", value: "alias" },
  { label: "axios(config)", value: "config" },
] as const;

export default function CurlToAxiosWorkspace(props: WorkspaceProps) {
  const languageId = useId();
  const moduleId = useId();
  const moduleFormat = typeof props.settings.moduleFormat === "string" ? props.settings.moduleFormat : "none";
  const outputLanguage = props.settings.outputLanguage === "typescript" ? "typescript" : "javascript";
  const requestStyle = typeof props.settings.requestStyle === "string" ? props.settings.requestStyle : "config";

  useEffect(() => {
    props.onToolbarActionsChange?.({ exampleLabel: "Load example" });
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange]);

  useEffect(() => {
    if (!props.error) return;
    const notification = toast.error("Unable to convert", { description: props.error });
    return () => toast.dismiss(notification);
  }, [props.error]);

  return (
    <ToolWorkspace
      {...props}
      error={undefined}
      spec={{ ...props.spec, outputLanguage }}
      resultHeaderActions={
        <>
          <FieldLabel className="sr-only" htmlFor={languageId}>
            Output language
          </FieldLabel>
          <Select
            className="w-36"
            disabled={props.disabled}
            id={languageId}
            onChange={(event) => props.onSettingChange("outputLanguage", event.currentTarget.value)}
            size="xs"
            value={outputLanguage}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
          </Select>
        </>
      }
      renderResult={(result) => (
        // Conversion warnings are already presented by the runtime's shared toast.
        <ResultView result={{ ...result, issues: undefined, verdict: undefined }} language={outputLanguage} />
      )}
      renderSettings={() => (
        <>
          <div className="grid gap-1.5">
            <FieldLabel htmlFor={moduleId}>Module format</FieldLabel>
            <Select
              disabled={props.disabled}
              id={moduleId}
              onChange={(event) => props.onSettingChange("moduleFormat", event.currentTarget.value)}
              value={moduleFormat}
            >
              <option value="none">No import</option>
              <option value="esm">ES module import</option>
              <option value="commonjs">CommonJS require</option>
            </Select>
          </div>
          <SegmentedControl
            aria-label="Request style"
            items={REQUEST_STYLES.map((item) => ({ ...item, disabled: props.disabled }))}
            onValueChange={(value) => props.onSettingChange("requestStyle", value)}
            size="field"
            value={requestStyle}
          />
        </>
      )}
    />
  );
}
