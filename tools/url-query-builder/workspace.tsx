"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { Button, FieldDescription, FieldError, FieldLabel, H4, Input } from "@/components/ui/index.tsx";
import type { SettingRow } from "@/lib/tool-framework/settings";
import { parseQueryRows } from "./parameters";

function QueryParameters(props: WorkspaceProps) {
  const id = useId();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const keyInputs = useRef<(HTMLInputElement | null)[]>([]);
  const bulkInput = useRef<HTMLElement | null>(null);
  const pasteButton = useRef<HTMLButtonElement | null>(null);
  const focusRow = useRef<number | "paste" | null>(null);
  const savedRows = useMemo(() => {
    const value = props.settings.parameters;
    return Array.isArray(value)
      ? value.filter(
          (row): row is SettingRow =>
            typeof row === "object" && row !== null && typeof row.key === "string" && typeof row.value === "string",
        )
      : [];
  }, [props.settings.parameters]);
  const legacy = useMemo(() => {
    try {
      return { rows: parseQueryRows(props.input.secondary ?? ""), error: "" };
    } catch {
      return { rows: [], error: "Each line needs a parameter key followed by = and its value." };
    }
  }, [props.input.secondary]);
  const rows = [...legacy.rows, ...savedRows];
  const visibleRows = rows.length ? rows : [{ key: "", value: "" }];
  const showBulk = bulkOpen || Boolean(legacy.error);
  const bulkValue = bulkOpen ? draft : (props.input.secondary ?? "");
  const bulkError = draftError || (!bulkOpen ? legacy.error : "");
  const rowEditingDisabled = props.disabled || Boolean(legacy.error);

  useEffect(() => {
    if (bulkOpen) bulkInput.current?.focus();
  }, [bulkOpen]);

  useEffect(() => {
    if (focusRow.current !== null) {
      if (focusRow.current === "paste") pasteButton.current?.focus();
      else keyInputs.current[focusRow.current]?.focus();
      focusRow.current = null;
    }
  }, [props.settings.parameters, props.input.secondary, bulkOpen]);

  useEffect(() => {
    if (!props.input.text && !props.input.secondary && savedRows.length === 0) {
      setBulkOpen(false);
      setDraft("");
      setDraftError("");
    }
  }, [props.input.text, props.input.secondary, savedRows.length]);

  const updateRows = (next: readonly SettingRow[]) => {
    if (props.input.secondary) props.onInputChange({ ...props.input, secondary: "" });
    props.onSettingChange("parameters", next);
  };
  const applyBulk = () => {
    try {
      const imported = parseQueryRows(bulkValue);
      if (!imported.length && !legacy.error) {
        setDraftError("Enter at least one key=value line.");
        return;
      }
      focusRow.current = legacy.error ? 0 : rows.length;
      updateRows(legacy.error ? [...imported, ...savedRows] : [...rows, ...imported]);
      setBulkOpen(false);
      setDraft("");
      setDraftError("");
    } catch {
      setDraftError("Each line needs a parameter key followed by = and its value. For example: tag=dev.");
    }
  };

  return (
    <div className="@container">
      <section aria-labelledby={`${id}-heading`} className="space-y-2">
        <Stack direction="row" align="center" justify="between" gap="sm" wrap>
          <H4 id={`${id}-heading`}>Query parameters</H4>
          <Stack direction="row" align="center" gap="sm">
            <Button
              aria-label="Add parameter"
              disabled={rowEditingDisabled}
              onClick={() => {
                focusRow.current = visibleRows.length;
                updateRows([...visibleRows, { key: "", value: "" }]);
              }}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" /> Add
            </Button>
            {!showBulk ? (
              <Button
                ref={pasteButton}
                disabled={props.disabled}
                onClick={() => {
                  setBulkOpen(true);
                  setDraft("");
                  setDraftError("");
                }}
                type="button"
                variant="outline"
              >
                Paste multiple
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {showBulk ? (
          <div className="space-y-2">
            <FieldLabel htmlFor={`${id}-bulk`}>Parameters to paste</FieldLabel>
            <SourceTextarea
              aria-label="Parameters to paste"
              aria-describedby={`${id}-bulk-help${bulkError ? ` ${id}-bulk-error` : ""}`}
              aria-invalid={Boolean(bulkError)}
              className="h-24"
              disabled={props.disabled}
              id={`${id}-bulk`}
              onChange={(value) => {
                setBulkOpen(true);
                setDraft(value);
                setDraftError("");
              }}
              placeholder={"q=smart tools\ntag=dev\ntag=web"}
              scrollRef={bulkInput}
              showLineNumbers={false}
              surface="card"
              value={bulkValue}
            />
            <FieldDescription id={`${id}-bulk-help`}>
              {legacy.error
                ? "Correct the pasted lines, or clear them to discard this import. Your other parameter rows will be kept."
                : "One key=value pair per line. These will be added to the rows below."}
            </FieldDescription>
            {bulkError ? <FieldError id={`${id}-bulk-error`}>{bulkError}</FieldError> : null}
            <Stack direction="row" gap="sm">
              <Button disabled={props.disabled} onClick={applyBulk} type="button">
                {legacy.error ? "Apply parameters" : "Add parameters"}
              </Button>
              {!legacy.error ? (
                <Button
                  disabled={props.disabled}
                  onClick={() => {
                    focusRow.current = "paste";
                    setBulkOpen(false);
                    setDraftError("");
                  }}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              ) : null}
            </Stack>
          </div>
        ) : null}

        <div className="space-y-2">
          {visibleRows.map((row, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 @min-[24rem]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]"
              key={index}
            >
              <div className="col-span-2 grid gap-1.5 @min-[24rem]:col-span-1">
                <FieldLabel className={index ? "@min-[24rem]:sr-only" : undefined} htmlFor={`${id}-key-${index}`}>
                  Key
                </FieldLabel>
                <Input
                  aria-label={`Parameter key ${index + 1}`}
                  autoCapitalize="off"
                  autoComplete="off"
                  disabled={rowEditingDisabled}
                  id={`${id}-key-${index}`}
                  onChange={(event) =>
                    updateRows(
                      visibleRows.map((entry, position) =>
                        position === index ? { ...entry, key: event.currentTarget.value } : entry,
                      ),
                    )
                  }
                  placeholder="e.g. tag"
                  ref={(element) => {
                    keyInputs.current[index] = element;
                  }}
                  spellCheck={false}
                  value={row.key}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <FieldLabel className={index ? "@min-[24rem]:sr-only" : undefined} htmlFor={`${id}-value-${index}`}>
                  Value
                </FieldLabel>
                <Input
                  aria-label={`Value ${index + 1}`}
                  autoCapitalize="off"
                  autoComplete="off"
                  disabled={rowEditingDisabled}
                  id={`${id}-value-${index}`}
                  onChange={(event) =>
                    updateRows(
                      visibleRows.map((entry, position) =>
                        position === index ? { ...entry, value: event.currentTarget.value } : entry,
                      ),
                    )
                  }
                  placeholder="e.g. dev"
                  spellCheck={false}
                  value={row.value}
                />
              </div>
              <Button
                aria-label={`Remove parameter ${index + 1}`}
                disabled={rowEditingDisabled || rows.length === 0}
                onClick={() => {
                  focusRow.current = Math.max(0, index - 1);
                  updateRows(visibleRows.filter((_, position) => position !== index));
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function UrlQueryBuilderWorkspace(props: WorkspaceProps) {
  return (
    <ToolWorkspace
      {...props}
      spec={{
        ...props.spec,
        input: {
          kind: "fields",
          label: "URL details",
          fields:
            props.spec.input.kind === "fields"
              ? props.spec.input.fields.filter((field) => field.channel === "text")
              : [],
        },
      }}
      renderInputSettings={() => <QueryParameters {...props} />}
    />
  );
}
