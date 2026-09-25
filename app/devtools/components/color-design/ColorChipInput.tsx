"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";

import { Badge, Button, ColorSwatch, FieldError, Input, Textarea } from "@/components/ui/index.tsx";
import { inputVariants } from "@/components/ui/components/input.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import { parseColor, parseHexColor, rgbToHex, type RgbColor } from "@/lib/devtools/shared/color";

type ColorChipInputProps = Pick<
  ComponentProps<"input">,
  "id" | "aria-describedby" | "aria-errormessage" | "aria-invalid"
> & {
  value: string;
  onValueChange: (value: string) => void;
  inputFormat: "hex" | "rgb" | "any";
  disabled?: boolean;
  placeholder?: string;
};

function colorLines(value: string) {
  return value
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ColorChipInput({
  value,
  onValueChange,
  inputFormat,
  disabled,
  placeholder,
  ...inputProps
}: ColorChipInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const lastWritten = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const entries = colorLines(value);

  useEffect(() => {
    if (lastWritten.current !== value) {
      setDraft("");
      setDraftError("");
      setEditingIndex(null);
    }
    lastWritten.current = null;
  }, [value, inputFormat]);

  useEffect(() => {
    if (editingIndex !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingIndex]);

  function write(next: string[]) {
    const text = next.join("\n");
    if (text === value) return;
    lastWritten.current = text;
    onValueChange(text);
  }

  function clearDraft() {
    setDraft("");
    setDraftError("");
    setEditingIndex(null);
  }

  function commit(text = draft) {
    const additions = colorLines(text);
    if (!additions.length || disabled) return;
    const draftLines = text.split(/\r\n?|\n/);
    for (const [index, line] of draftLines.entries()) {
      if (!line.trim()) continue;
      try {
        if (inputFormat === "hex") parseHexColor(line.trim());
        else {
          if (inputFormat === "rgb" && !/^rgba?\(/i.test(line.trim())) {
            throw new Error("Use an rgb() or rgba() color.");
          }
          parseColor(line.trim());
        }
      } catch (error) {
        setDraft(text);
        setDraftError(
          `${draftLines.length > 1 ? `Line ${index + 1}: ` : ""}${error instanceof Error ? error.message : "Enter a valid color."}`,
        );
        inputRef.current?.focus();
        return;
      }
    }
    const next = [...entries];
    if (editingIndex === null) next.push(...additions);
    else next.splice(editingIndex, 1, ...additions);
    write(next);
    clearDraft();
    inputRef.current?.focus();
  }

  function changeColor(index: number, nextHex: string, alpha: number) {
    const next = { ...parseColor(nextHex), alpha };
    const useRgb =
      inputFormat === "rgb" || (inputFormat === "any" && alpha < 1 && !/^#?[\da-f]+$/i.test(entries[index]));
    const color = useRgb
      ? `${alpha < 1 ? "rgba" : "rgb"}(${next.red}, ${next.green}, ${next.blue}${alpha < 1 ? `, ${alpha}` : ""})`
      : rgbToHex(next);
    write(entries.map((entry, entryIndex) => (entryIndex === index ? color : entry)));
    if (editingIndex === index) {
      setDraft(color);
      setDraftError("");
    }
  }

  function remove(index: number) {
    write(entries.filter((_, entryIndex) => entryIndex !== index));
    if (editingIndex === index) clearDraft();
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
    inputRef.current?.focus();
  }

  return (
    <>
      <div
        aria-invalid={Boolean(draftError) || inputProps["aria-invalid"]}
        className={cn(
          inputVariants(),
          "flex h-auto min-h-32 flex-col gap-2 p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 aria-invalid:focus-within:border-validation aria-invalid:focus-within:ring-validation/15",
          disabled && "bg-muted opacity-70",
        )}
      >
        {entries.length ? (
          <div aria-label="Added colors" className="flex flex-wrap gap-2" role="list">
            {entries.map((entry, index) => {
              let color: RgbColor | undefined;
              let valid = true;
              try {
                color = parseColor(entry);
                if (inputFormat === "hex") parseHexColor(entry);
                if (inputFormat === "rgb" && !/^rgba?\(/i.test(entry)) valid = false;
              } catch {
                valid = false;
              }
              return (
                <Badge
                  aria-invalid={!valid}
                  className="max-w-full gap-1 bg-muted py-0 pl-1 pr-0.5"
                  key={index}
                  role="listitem"
                  variant="secondary"
                >
                  <span className="group/color-picker relative flex size-6 shrink-0 items-center justify-center">
                    <span aria-hidden="true">
                      <ColorSwatch
                        className="size-4 rounded-full group-focus-within/color-picker:ring-2 group-focus-within/color-picker:ring-ring group-focus-within/color-picker:ring-offset-2"
                        color={color ? rgbToHex(color) : "transparent"}
                      />
                    </span>
                    <Input
                      aria-label={`Choose color ${index + 1}: ${entry}`}
                      className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:opacity-0"
                      disabled={disabled}
                      onChange={(event) => changeColor(index, event.target.value, color?.alpha ?? 1)}
                      style={{ height: "100%", width: "100%" }}
                      type="color"
                      value={color ? rgbToHex({ ...color, alpha: 1 }) : "#2563EB"}
                    />
                  </span>
                  <Button
                    aria-label={`Edit ${valid ? "color" : "invalid color"} ${index + 1}: ${entry}`}
                    aria-pressed={editingIndex === index}
                    className="min-w-0 shrink px-1"
                    disabled={disabled}
                    onClick={() => {
                      if (editingIndex === index) {
                        inputRef.current?.focus();
                        inputRef.current?.select();
                        return;
                      }
                      setDraft(entry);
                      setDraftError("");
                      setEditingIndex(index);
                    }}
                    size="xs"
                    type="button"
                    variant="card-action"
                  >
                    <span className="truncate font-mono">{entry}</span>
                  </Button>
                  <Button
                    aria-label={`Remove color ${index + 1}: ${entry}`}
                    className="rounded-full"
                    disabled={disabled}
                    onClick={() => remove(index)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" />
                  </Button>
                </Badge>
              );
            })}
          </div>
        ) : null}
        <div className="flex min-h-20 min-w-0 flex-1 items-stretch gap-2">
          <Textarea
            {...inputProps}
            aria-invalid={Boolean(draftError) || inputProps["aria-invalid"]}
            aria-errormessage={
              [inputProps["aria-errormessage"], draftError && errorId].filter(Boolean).join(" ") || undefined
            }
            autoComplete="off"
            className="field-sizing-fixed min-h-20 min-w-0 flex-1 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 aria-invalid:ring-0"
            code
            disabled={disabled}
            onChange={(event) => {
              setDraft(event.target.value);
              setDraftError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape" && (draft || editingIndex !== null)) {
                event.preventDefault();
                event.stopPropagation();
                clearDraft();
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/[\r\n]/.test(text)) return;
              event.preventDefault();
              const start = event.currentTarget.selectionStart ?? draft.length;
              const end = event.currentTarget.selectionEnd ?? start;
              commit(`${draft.slice(0, start)}${text}${draft.slice(end)}`);
            }}
            placeholder={placeholder}
            ref={inputRef}
            spellCheck={false}
            value={draft}
          />
          <Button
            className="self-end"
            disabled={disabled || !draft.trim()}
            onClick={() => commit()}
            size="xs"
            type="button"
            variant="outline"
          >
            {editingIndex === null ? <Plus aria-hidden="true" /> : null}
            {editingIndex === null ? "Add" : "Save"}
          </Button>
        </div>
      </div>
      {draftError ? <FieldError id={errorId}>{draftError}</FieldError> : null}
    </>
  );
}
