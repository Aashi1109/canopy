"use client";

import {
  typographyStyles,
  FieldLabel,
  Muted,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  ToolActionButton,
  Input,
  FileChip,
} from "@/components/ui/index.tsx";
import { cn } from "@/components/ui/lib/utils.ts";
import { Eye, EyeOff } from "lucide";
import { FileText, Upload } from "lucide-react";
import { MorphIcon } from "morphicons/react";
import {
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { textInputFileIssue, validateFileSelection, workspaceFileId } from "@/components/FileInput";
import { PasswordInput } from "@/components/PasswordInput";
import { SplitStack, Stack } from "@/components/Stacks";
import { CodeEditor, type CodeEditorHandle } from "@/components/content/CodeEditor";
import { FileIntakeSurface, FileQueueSurface, WorkspaceSurface } from "@/components/Surfaces";
import type { WorkspaceInputState, WorkspaceProps } from "@/components/ToolWorkspace";
import type { ToolInputSpec } from "@/lib/tool-framework/spec";
import { isLargeTextFile, readTextFileForEditor } from "@/lib/tool-framework/textFileInput";

const DEFAULT_TEXT_FILE_INPUT = {
  accept:
    ".txt,.json,.csv,.tsv,.xml,.yaml,.yml,.html,.htm,.css,.js,.mjs,.cjs,.ts,.tsx,.jsx,.md,.markdown,text/*,application/json,application/xml,application/javascript",
  maxBytes: 2_000_000,
  maxEditableBytes: 2_000_000,
} as const;

interface InputSurfaceProps {
  disabled?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  highlightedInput?: ReactNode;
  inputHighlightMode?: SourceTextareaProps["highlightMode"];
  input: WorkspaceInputState;
  inputSpec: ToolInputSpec;
  onInputChange: WorkspaceProps["onInputChange"];
  onSourceScroll?: (scroller: HTMLElement) => void;
  sourceRef?: Ref<HTMLElement>;
  variant?: "card" | "panel";
}

interface SourceTextareaProps extends Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "wrap"
> {
  className: string;
  disabled?: boolean;
  highlightedValue?: ReactNode;
  highlightMode?: "persistent" | "preview";
  language?: string;
  id: string;
  maxLength?: number;
  showLineNumbers?: boolean;
  surface?: "card";
  transparent?: boolean;
  onCaretChange?: (position: { readonly column: number; readonly line: number }) => void;
  onChange: (value: string) => void;
  onScroll?: (scroller: HTMLElement) => void;
  scrollRef?: Ref<HTMLElement>;
  editorRef?: Ref<CodeEditorHandle>;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  value: string;
}

function isCodeShaped(value: string): boolean {
  const trimmed = value.trim();
  const lines = trimmed.split(/\r\n?|\n/).filter(Boolean);
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (value.includes("{") && value.includes("}") && /[:;]/.test(value)) ||
    /=>|<\/?[A-Za-z][^>]*>|;\s*$/m.test(value)
  )
    return true;
  if (lines.length < 2) return false;

  const delimited = [",", "\t", "|"].some((delimiter) => {
    const counts = lines.map((line) => line.split(delimiter).length - 1);
    return counts[0] > 0 && counts.every((count) => count === counts[0]);
  });
  return delimited || lines.filter((line) => /^\s*[\w"'-]+\s*:\s*\S/.test(line)).length > 1;
}

function sourceMeta(value: string, codeShaped: boolean): string {
  const count = codeShaped ? new TextEncoder().encode(value).byteLength : value.length;
  return `${count} ${codeShaped ? "bytes" : count === 1 ? "character" : "characters"}`;
}

export function SourceTextarea(props: SourceTextareaProps) {
  if (!props.language || props.highlightedValue) return <PlainSourceTextarea {...props} />;
  const Container = props.surface === "card" ? Card : "div";
  return (
    <Container
      className={cn(
        "flex min-w-0 overflow-hidden",
        props.surface === "card"
          ? "gap-0 rounded-lg border-input p-0 shadow-none has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/20"
          : `${props.transparent ? "bg-transparent" : "bg-background"} has-[:focus-visible]:bg-muted/40`,
        props.className,
      )}
    >
      <CodeEditor
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-invalid={props["aria-invalid"]}
        className="min-h-0 min-w-0 flex-1"
        disabled={props.disabled}
        editorRef={props.editorRef}
        id={props.id}
        language={props.language}
        maxLength={props.maxLength}
        onCaretChange={props.onCaretChange}
        onChange={props.onChange}
        onScroll={props.onScroll}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        required={props.required}
        scrollRef={props.scrollRef}
        showLineNumbers={props.showLineNumbers}
        value={props.value}
        wrap={props.wrap === "off" ? "off" : props.wrap ? "soft" : undefined}
      />
    </Container>
  );
}

function PlainSourceTextarea({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  highlightedValue,
  highlightMode = "persistent",
  id,
  maxLength,
  showLineNumbers = true,
  surface,
  transparent = false,
  onCaretChange,
  onChange,
  onScroll,
  scrollRef,
  placeholder,
  readOnly,
  required,
  value,
  wrap,
}: SourceTextareaProps) {
  const gutterRef = useRef<HTMLPreElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const Container = surface === "card" ? Card : "div";
  const [focused, setFocused] = useState(false);
  const resolvedWrap = wrap ?? "soft";
  const showHighlight = Boolean(highlightedValue && (highlightMode === "persistent" || !focused));
  const reportCaret = (textarea: HTMLTextAreaElement) => {
    if (!onCaretChange) return;
    const valueBeforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const lines = valueBeforeCaret.split(/\r\n?|\n/);
    onCaretChange({
      column: (lines.at(-1)?.length ?? 0) + 1,
      line: lines.length,
    });
  };
  const lineNumbers = useMemo(() => {
    const lineCount = (value.match(/\r\n|\r|\n/g)?.length ?? 0) + 1;
    return Array.from({ length: lineCount }, (_, index) => index + 1).join("\n");
  }, [value]);

  return (
    <Container
      className={cn(
        "flex min-w-0 overflow-hidden pl-4",
        surface === "card"
          ? "flex-row gap-0 rounded-lg border-input py-0 pr-0 shadow-none has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/20"
          : `${transparent ? "bg-transparent" : "bg-background"} has-[:focus-visible]:bg-muted/40`,
        className,
      )}
    >
      {showLineNumbers ? (
        <div aria-hidden="true" className="w-[15px] min-w-max shrink-0 overflow-hidden text-right">
          <pre
            className={`${typographyStyles.codeBlock} m-0 select-none py-[18px] text-muted-foreground will-change-transform`}
            ref={gutterRef}
          >
            {lineNumbers}
          </pre>
        </div>
      ) : null}
      <div className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${showLineNumbers ? "ml-[14px]" : ""}`}>
        {showHighlight ? (
          <pre
            aria-hidden="true"
            className={cn(
              typographyStyles.codeBlock,
              "pointer-events-none absolute inset-x-0 top-0 z-0 m-0 min-h-full py-[18px] pr-4 text-foreground will-change-transform",
              resolvedWrap === "off" ? "whitespace-pre" : "whitespace-pre-wrap break-all",
            )}
            ref={highlightRef}
          >
            {highlightedValue}
          </pre>
        ) : null}
        <textarea
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            typographyStyles.codeBlock,
            `relative z-10 h-full min-h-0 w-full min-w-0 resize-none overflow-y-auto border-0 bg-transparent py-[18px] pr-4 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 ${showHighlight ? "whitespace-pre-wrap break-all text-transparent caret-foreground" : "text-foreground"} ${resolvedWrap === "off" ? "whitespace-pre overflow-x-auto" : "whitespace-pre-wrap overflow-x-hidden"}`,
          )}
          disabled={disabled}
          id={id}
          maxLength={maxLength}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            reportCaret(event.currentTarget);
          }}
          onBlur={() => setFocused(false)}
          onFocus={(event) => {
            setFocused(true);
            reportCaret(event.currentTarget);
          }}
          onSelect={(event) => reportCaret(event.currentTarget)}
          onScroll={(event) => {
            const { scrollLeft, scrollTop } = event.currentTarget;
            if (gutterRef.current) {
              gutterRef.current.style.transform = `translateY(-${scrollTop}px)`;
            }
            if (highlightRef.current) {
              highlightRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
            }
            onScroll?.(event.currentTarget);
          }}
          placeholder={placeholder}
          readOnly={readOnly}
          ref={scrollRef as Ref<HTMLTextAreaElement>}
          required={required}
          spellCheck={false}
          value={value}
          wrap={resolvedWrap}
        />
      </div>
    </Container>
  );
}
export function WorkspaceInputSurface({
  disabled,
  footer,
  header,
  highlightedInput,
  inputHighlightMode,
  input,
  inputSpec,
  onInputChange,
  onSourceScroll,
  sourceRef,
  variant,
}: InputSurfaceProps) {
  const idPrefix = useId();
  const [inputIssue, setInputIssue] = useState("");
  const [revealedSecrets, setRevealedSecrets] = useState<Readonly<Record<string, boolean>>>({});
  const [pasteFailed, setPasteFailed] = useState(false);
  const [pastePending, setPastePending] = useState(false);
  const [pasteSupported, setPasteSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadRequestRef = useRef(0);
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    setPasteSupported(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);
  useEffect(() => setPasteFailed(false), [input.secondary, input.text]);
  useEffect(() => {
    fileReadRequestRef.current += 1;
  }, [input.files, input.text]);

  const pastePrimaryInput = async (maxLength?: number) => {
    if (pastePending) return;
    fileReadRequestRef.current += 1;
    setPasteFailed(false);
    setPastePending(true);
    try {
      const clipboard = navigator.clipboard;
      if (typeof clipboard?.readText !== "function") {
        setPasteSupported(false);
        return;
      }
      const text = await clipboard.readText();
      onInputChange({
        ...inputRef.current,
        files: [],
        text: maxLength === undefined ? text : text.slice(0, maxLength),
      });
    } catch {
      setPasteFailed(true);
    } finally {
      setPastePending(false);
    }
  };
  const pasteAction = (label: string, maxLength?: number) =>
    pasteSupported ? (
      <ToolActionButton
        action="paste"
        aria-busy={pastePending || undefined}
        aria-label={pasteFailed ? `Paste into ${label} failed. Try again` : `Paste into ${label}`}
        aria-live="polite"
        disabled={disabled || pastePending}
        onClick={() => void pastePrimaryInput(maxLength)}
        type="button"
      >
        {pastePending ? "Pasting…" : pasteFailed ? "Paste failed" : "Paste"}
      </ToolActionButton>
    ) : null;
  switch (inputSpec.kind) {
    case "text": {
      const acceptedFile = inputSpec.acceptFiles ?? DEFAULT_TEXT_FILE_INPUT;
      const selectedFile = input.files[0];
      const largeFile = isLargeTextFile(selectedFile, acceptedFile.maxEditableBytes);
      const chooseFile = async (file: File) => {
        if (!acceptedFile) return;
        const issue = textInputFileIssue(file, acceptedFile);
        if (issue) {
          setInputIssue(issue);
          return;
        }
        try {
          const request = ++fileReadRequestRef.current;
          const loaded = await readTextFileForEditor(file, {
            maxEditableBytes: acceptedFile.maxEditableBytes,
            maxLength: inputSpec.maxLength,
          });
          if (request !== fileReadRequestRef.current) return;
          setInputIssue("");
          onInputChange({
            ...inputRef.current,
            files: [file],
            text: loaded.text,
          });
        } catch {
          setInputIssue(`${file.name} could not be read.`);
        }
      };
      const browseAction = acceptedFile ? (
        <>
          <input
            accept={acceptedFile.accept}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void chooseFile(file);
            }}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <ToolActionButton
            action="upload"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            Upload
          </ToolActionButton>
        </>
      ) : null;
      const codeShaped = isCodeShaped(input.text) || isCodeShaped(inputSpec.placeholder ?? "");
      const editorSurface = header || inputSpec.secondary ? inputSpec.surface : undefined;
      return (
        <WorkspaceSurface
          actions={
            <>
              {pasteAction(inputSpec.label, inputSpec.maxLength)}
              {browseAction}
            </>
          }
          className="h-full"
          contentClassName="gap-4 bg-background"
          meta={
            selectedFile ? (
              <FileChip
                file={selectedFile}
                disabled={disabled}
                details={largeFile ? "Large-file mode" : undefined}
                onRemove={() => {
                  fileReadRequestRef.current += 1;
                  setInputIssue("");
                  onInputChange({ ...inputRef.current, files: [], text: "" });
                  document.getElementById(`${idPrefix}-primary`)?.focus();
                }}
              />
            ) : (
              sourceMeta(input.text, codeShaped)
            )
          }
          metaPosition={selectedFile ? "start" : "actions"}
          purpose="source"
          title={inputSpec.label}
          variant={variant}
        >
          {header}
          <div
            className={cn(
              "grid min-h-0 flex-1 gap-1.5",
              editorSurface === "card" && "grid-rows-[auto_minmax(0,1fr)] px-4 pb-4",
              editorSurface === "card" && !header && "pt-4",
            )}
          >
            <FieldLabel
              className={editorSurface === "card" ? "text-muted-foreground" : "sr-only"}
              htmlFor={`${idPrefix}-primary`}
            >
              {inputSpec.label}
            </FieldLabel>
            <SourceTextarea
              aria-label={inputSpec.label}
              className="min-h-48 flex-1"
              disabled={disabled}
              id={`${idPrefix}-primary`}
              highlightedValue={highlightedInput}
              highlightMode={inputHighlightMode}
              language={inputSpec.language}
              showLineNumbers={variant !== "card"}
              surface={editorSurface}
              transparent={variant === "card"}
              maxLength={inputSpec.maxLength}
              onChange={(text) => onInputChange({ ...input, files: [], text })}
              onScroll={onSourceScroll}
              scrollRef={sourceRef}
              placeholder={inputSpec.placeholder}
              readOnly={largeFile}
              value={input.text}
            />
          </div>
          {largeFile ? (
            <Muted className="px-4 pb-3 text-muted-foreground">
              Showing the first 256 KiB. The complete file stays read-only and is processed locally when you run the
              tool.
            </Muted>
          ) : null}
          {inputSpec.secondary ? (
            <div className="grid gap-1.5">
              <FieldLabel htmlFor={`${idPrefix}-secondary`}>{inputSpec.secondary.label}</FieldLabel>
              <SourceTextarea
                aria-label={inputSpec.secondary.label}
                className="min-h-28"
                disabled={disabled}
                id={`${idPrefix}-secondary`}
                language={inputSpec.secondary.language}
                showLineNumbers={variant !== "card"}
                transparent={variant === "card"}
                onChange={(secondary) => onInputChange({ ...input, secondary })}
                placeholder={inputSpec.secondary.placeholder}
                value={input.secondary ?? ""}
              />
            </div>
          ) : null}
          {inputIssue ? (
            <Muted className="px-4 pb-3 text-destructive" role="alert">
              {inputIssue}
            </Muted>
          ) : null}
        </WorkspaceSurface>
      );
    }
    case "fields": {
      const primaryField = inputSpec.fields.find((field) => field.channel === "text");
      const values = inputSpec.fields.map((field) => (field.channel === "text" ? input.text : (input.secondary ?? "")));
      const codeShaped = inputSpec.fields.some(
        (field, index) =>
          Boolean(field.multiline) && (isCodeShaped(values[index]) || isCodeShaped(field.placeholder ?? "")),
      );
      const hasMultiline = inputSpec.fields.some((field) => field.multiline);
      const singleTextarea = inputSpec.fields.length === 1 && hasMultiline && !footer;
      const cardFields = variant === "card" && hasMultiline && !singleTextarea;
      const resizableFields = Boolean(
        inputSpec.resizable && inputSpec.fields.length === 2 && inputSpec.fields.every((field) => field.multiline),
      );
      const fields = inputSpec.fields.map((field, index) => {
        const fieldId = `${idPrefix}-${field.channel}`;
        const value = field.channel === "text" ? input.text : (input.secondary ?? "");
        const fieldCodeShaped = Boolean(field.multiline);
        const fieldSurface = singleTextarea ? undefined : field.surface;
        const revealed = Boolean(revealedSecrets[field.channel]);
        const updateValue = (nextValue: string) => onInputChange({ ...input, [field.channel]: nextValue });
        return (
          <div
            className={
              singleTextarea
                ? "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]"
                : resizableFields
                  ? "grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 py-3"
                  : cardFields
                    ? "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-muted/45"
                    : fieldSurface === "card"
                      ? `grid ${footer ? "min-h-36" : "min-h-0"} flex-1 grid-rows-[auto_minmax(0,1fr)] gap-1.5 first:pt-4 last:pb-4`
                      : `grid gap-1.5 ${hasMultiline ? "first:pt-4 last:pb-4" : ""} ${hasMultiline && !fieldCodeShaped ? "px-4" : ""}`
            }
            key={field.channel}
          >
            <div className={cardFields ? "flex min-h-10 items-center justify-between gap-3 px-4 pt-2" : undefined}>
              <FieldLabel
                className={
                  singleTextarea
                    ? "sr-only"
                    : cardFields
                      ? "text-muted-foreground"
                      : variant === "card"
                        ? "sr-only"
                        : fieldCodeShaped
                          ? "px-4"
                          : undefined
                }
                htmlFor={fieldId}
                required={field.required && !cardFields}
              >
                {field.label}
              </FieldLabel>
              {cardFields && index === 0 ? pasteAction(field.label, field.maxLength) : null}
            </div>
            <div
              className={`flex min-h-0 gap-2 ${singleTextarea || cardFields || fieldSurface === "card" ? "h-full items-stretch" : "items-start"} ${cardFields && !field.multiline ? "px-4 pb-4" : ""}`}
            >
              {field.multiline ? (
                <div
                  className={cn(
                    "relative flex-1",
                    resizableFields ? "min-h-0" : "min-h-28",
                    fieldSurface === "card" && "mx-4",
                  )}
                >
                  <SourceTextarea
                    aria-label={field.label}
                    className={`h-full ${resizableFields ? "min-h-0" : "min-h-28"} ${field.secret ? `[&_textarea]:pr-14 ${revealed ? "" : "[&_textarea]:[-webkit-text-security:disc]"}` : ""}`}
                    disabled={disabled}
                    id={fieldId}
                    language={!field.secret || revealed ? field.language : undefined}
                    showLineNumbers={variant !== "card"}
                    surface={fieldSurface}
                    transparent={variant === "card"}
                    maxLength={field.maxLength}
                    onChange={updateValue}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={value}
                  />
                  {field.secret ? (
                    <Button
                      aria-label={revealed ? "Hide password" : "Show password"}
                      className="absolute right-0 top-0 z-20"
                      disabled={disabled}
                      onClick={() =>
                        setRevealedSecrets((current) => ({
                          ...current,
                          [field.channel]: !revealed,
                        }))
                      }
                      size="icon"
                      type="button"
                      variant="input-icon"
                    >
                      <MorphIcon icon={revealed ? EyeOff : Eye} reducedMotion="user" size={18} />
                    </Button>
                  ) : null}
                </div>
              ) : field.secret ? (
                <PasswordInput
                  code
                  disabled={disabled}
                  id={fieldId}
                  maxLength={field.maxLength}
                  onChange={(event) => updateValue(event.currentTarget.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={value}
                />
              ) : (
                <Input
                  className="flex-1"
                  code
                  disabled={disabled}
                  id={fieldId}
                  maxLength={field.maxLength}
                  onChange={(event) => updateValue(event.currentTarget.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  type="text"
                  value={value}
                />
              )}
            </div>
          </div>
        );
      });
      return (
        <WorkspaceSurface
          actions={
            cardFields ? undefined : pasteAction(primaryField?.label ?? "primary input", primaryField?.maxLength)
          }
          className={
            cardFields
              ? "h-full [&>[data-slot=workspace-card]]:overflow-visible [&>[data-slot=workspace-card]]:border-0 [&>[data-slot=workspace-card]]:bg-transparent"
              : "h-full [&_[data-stack=scroll-region]]:bg-background"
          }
          contentClassName={
            resizableFields
              ? "bg-background"
              : cardFields
                ? `grid h-full auto-rows-fr gap-4 bg-transparent ${inputSpec.fields.length > 1 ? "md:grid-cols-2" : ""}`
                : hasMultiline
                  ? "gap-4 bg-background"
                  : "gap-4 bg-background p-4"
          }
          header={cardFields ? "sr-only" : "visible"}
          meta={cardFields ? undefined : sourceMeta(values.join(""), codeShaped)}
          purpose="source"
          scroll={
            singleTextarea ||
            resizableFields ||
            (!footer && (cardFields || inputSpec.fields.some((field) => field.surface === "card")))
              ? "none"
              : "content"
          }
          title={inputSpec.label}
          variant={variant}
        >
          {resizableFields ? (
            <SplitStack defaultSize={50} minSize={30} maxSize={70} orientation="vertical">
              {fields}
            </SplitStack>
          ) : (
            fields
          )}
          {footer}
        </WorkspaceSurface>
      );
    }
    case "files":
      return (
        <Stack className="h-full">
          <FileIntakeSurface
            accept={inputSpec.accept}
            className="min-h-64 flex-1 border-b border-border"
            disabled={disabled}
            intakeIcon={<Upload aria-hidden="true" />}
            intakeTitle={inputSpec.label}
            maxFiles={Number.MAX_SAFE_INTEGER}
            multiple={inputSpec.multiple}
            onFiles={(files) => {
              const selection = validateFileSelection(input.files, files, inputSpec);
              setInputIssue(selection.issue);
              onInputChange({ ...input, files: selection.files });
            }}
            title={inputSpec.label}
          />
          {inputIssue ? (
            <Alert className="m-3" variant="destructive">
              <AlertTitle>Some files were not added</AlertTitle>
              <AlertDescription>{inputIssue}</AlertDescription>
            </Alert>
          ) : null}
          <FileQueueSurface
            className="min-h-48 flex-1"
            getIcon={() => <FileText aria-hidden="true" />}
            getId={workspaceFileId}
            getMetadata={(file) => `${file.type || "Unknown type"} · ${file.size.toLocaleString()} bytes`}
            getName={(file) => file.name}
            getFile={(file) => file}
            items={input.files}
            disabled={disabled}
            onRemove={(file) => onInputChange({ ...input, files: input.files.filter((entry) => entry !== file) })}
            title="Selected files"
          />
        </Stack>
      );
    case "none":
      // The tool reads no input channel — every value comes from its settings,
      // so there is deliberately no input surface to render.
      return null;
    default:
      return assertNoInputSurface(inputSpec);
  }
}

/**
 * Makes the switch above exhaustive: a new `ToolInputSpec` variant becomes a
 * compile error here rather than silently rendering a blank input pane.
 */
function assertNoInputSurface(inputSpec: never): never {
  throw new Error(`No input surface is registered for input kind ${JSON.stringify(inputSpec)}.`);
}
