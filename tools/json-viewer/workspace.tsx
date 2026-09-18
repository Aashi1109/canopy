"use client";

import {
  FieldLabel,
  P,
  Strong,
  Muted,
  Caption,
  Button,
  ToolActionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toaster,
  toast,
} from "@/components/ui/index.tsx";
import {
  AlignLeft,
  CircleCheckBig,
  FileText,
  FileWarning,
  Loader2,
  Minimize2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  highlightJson,
  type JsonEditorController,
  JsonResultRenderer,
  type JsonResultView,
  ROOT_JSON_TREE_PATH,
} from "@/components/JsonResultRenderer";
import { SplitStack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import { SourceTextarea } from "@/components/WorkspaceInput";
import { textInputFileIssue } from "@/components/FileInput";
import { ResultView } from "@/components/ResultView";
import type { WorkspaceProps, WorkspaceToolbarActions } from "@/components/ToolWorkspace";
import { isLargeTextFile, readTextFileForEditor } from "@/lib/tool-framework/textFileInput";

import { describeJsonViewerRepair } from "./execution";

type JsonTreeResult = { text: string; value: unknown } | null;
type JsonTransformPreview = {
  input: string;
  text: string;
  value: unknown;
} | null;
type JsonViewerSnapshot = { code: string; value: unknown };
type JsonViewerDraft = JsonViewerSnapshot & {
  future: JsonViewerSnapshot[];
  past: JsonViewerSnapshot[];
};
type JsonNoticeTone = "info" | "success" | "warning";
type JsonErrorLocation = { column: number; line: number };

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2) ?? "null";
}

function showJsonNotice(
  message: string,
  tone: JsonNoticeTone = "info",
  action?: { label: string; onClick: () => void },
) {
  const options = {
    action: action ?? {
      label: "Dismiss",
      onClick: () => toast.dismiss("json-viewer-notice"),
    },
    duration: 6_000,
    id: "json-viewer-notice",
  };
  if (tone === "success") {
    toast.success(message, options);
    return;
  }
  if (tone === "warning") {
    toast.warning(message, options);
    return;
  }
  toast.info(message, options);
}

function GoToJsonError({
  className = "",
  location,
  onClick,
}: {
  className?: string;
  location: JsonErrorLocation;
  onClick: () => void;
}) {
  return (
    <Button
      size="xs"
      variant="link"
      aria-label={`Go to JSON error at line ${location.line}, column ${location.column}`}
      className={`text-destructive ${className}`}
      onClick={onClick}
      type="button"
    >
      Go to line {location.line}, column {location.column}
    </Button>
  );
}

const BROKEN_EXAMPLE = '[{"id":1,"name":"Alice","age":},{"id":2,"name":"Bob","age":30}]';
const JSON_VALUE_TOKEN_PATTERN =
  /"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|'(?:\\.|[^\\'])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function risksNumericPrecisionLoss(input: string) {
  for (const match of input.matchAll(JSON_VALUE_TOKEN_PATTERN)) {
    const token = match[0];
    if (token.startsWith('"') || token.startsWith("'") || token.startsWith("//") || token.startsWith("/*")) continue;
    const value = Number(token);
    const significantDigits = token
      .split(/[eE]/, 1)[0]
      .replace("-", "")
      .replace(".", "")
      .replace(/^0+|0+$/g, "").length;
    if (
      !Number.isFinite(value) ||
      Object.is(value, -0) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
      significantDigits > 15 ||
      (value === 0 && /[1-9]/.test(token))
    )
      return true;
  }
  return false;
}

function JsonSourceEditor({
  editorId,
  onNotice,
  onSourceChange,
  ...props
}: WorkspaceProps & {
  editorId: string;
  onNotice: (message: string, tone?: JsonNoticeTone) => void;
  onSourceChange: (text: string) => void;
}) {
  const inputSpec = props.spec.input;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReadRequestRef = useRef(0);
  const selectedFile = props.input.files[0];
  const acceptedFile = inputSpec.kind === "text" ? inputSpec.acceptFiles : undefined;
  const largeFile = isLargeTextFile(selectedFile, acceptedFile?.maxEditableBytes);
  const selectedFileMeta = selectedFile ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes` : null;
  const inputBytes = useMemo(() => new TextEncoder().encode(props.input.text).length, [props.input.text]);
  const highlightedInput = useMemo(() => highlightJson(props.input.text), [props.input.text]);

  useEffect(() => {
    fileReadRequestRef.current += 1;
  }, [props.input.files, props.input.text]);

  if (inputSpec.kind !== "text") return null;

  const chooseFile = async (file: File) => {
    if (!acceptedFile) return;
    const issue = textInputFileIssue(file, acceptedFile);
    if (issue) {
      onNotice(issue, "warning");
      return;
    }
    try {
      const request = ++fileReadRequestRef.current;
      const loaded = await readTextFileForEditor(file, {
        maxEditableBytes: acceptedFile.maxEditableBytes,
        maxLength: inputSpec.maxLength,
      });
      if (request !== fileReadRequestRef.current) return;
      props.onInputChange({ ...props.input, files: [file], text: loaded.text });
    } catch {
      onNotice(`${file.name} could not be read.`, "warning");
    }
  };

  return (
    <WorkspaceSurface
      actions={
        <div className="flex items-center gap-1">
          {acceptedFile ? (
            <>
              <input
                accept={acceptedFile.accept}
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void chooseFile(file);
                }}
                ref={fileInputRef}
                type="file"
              />
              <ToolActionButton
                action="upload"
                disabled={props.disabled}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {selectedFile ? "Replace" : "Upload"}
              </ToolActionButton>
              {selectedFile ? (
                <Button
                  aria-label={`Remove ${selectedFile.name}`}
                  disabled={props.disabled}
                  onClick={() => {
                    fileReadRequestRef.current += 1;
                    props.onInputChange({ ...props.input, files: [], text: "" });
                  }}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              ) : null}
            </>
          ) : null}
          <ToolActionButton
            action="copy"
            aria-label={largeFile ? "Copy JSON preview" : "Copy JSON input"}
            disabled={props.input.text.length === 0}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(props.input.text);
                onNotice(largeFile ? "JSON preview copied." : "JSON input copied.", "success");
              } catch {
                onNotice("Copy failed. Select the input and copy it manually.", "warning");
              }
            }}
            type="button"
          >
            {largeFile ? "Copy preview" : "Copy"}
          </ToolActionButton>
        </div>
      }
      className="h-full"
      contentClassName="bg-background"
      meta={
        selectedFile ? (
          largeFile ? (
            <>
              <span className="sr-only">{selectedFileMeta} · </span>Large-file mode
            </>
          ) : (
            selectedFileMeta
          )
        ) : (
          `${inputBytes} bytes`
        )
      }
      description={largeFile ? selectedFileMeta : undefined}
      purpose="editor"
      title="JSON input"
    >
      <FieldLabel className="sr-only" htmlFor={editorId}>
        {inputSpec.label}
      </FieldLabel>
      <SourceTextarea
        className="min-h-0 flex-1"
        disabled={props.disabled}
        highlightedValue={highlightedInput}
        id={editorId}
        onChange={(text) => {
          onSourceChange(text);
        }}
        placeholder={inputSpec.placeholder}
        readOnly={largeFile}
        value={props.input.text}
        wrap="soft"
      />
    </WorkspaceSurface>
  );
}

function JsonResultPlaceholder({
  error,
  errorLocation,
  onGoToError,
  running,
}: Pick<WorkspaceProps, "error" | "running"> & {
  errorLocation: JsonErrorLocation | null;
  onGoToError: () => void;
}) {
  const title = error ? "JSON tree unavailable" : running ? "Parsing JSON…" : "Interactive tree will appear here";
  const description = error ?? (running ? "Parsing JSON…" : "Paste JSON to inspect its structure.");

  return (
    <div
      className="absolute inset-x-0 top-[46px] bottom-0 z-10 flex items-center justify-center bg-card p-6 text-center"
      data-testid="json-result-placeholder"
      role="status"
    >
      <div className="max-w-sm">
        <P className="text-foreground">
          <Strong>{title}</Strong>
        </P>
        <Muted className="mt-1 text-muted-foreground">{description}</Muted>
        {error && errorLocation ? (
          <GoToJsonError className="mt-3" location={errorLocation} onClick={onGoToError} />
        ) : null}
      </div>
    </div>
  );
}

function JsonResultPane({
  editor,
  error,
  errorLocation,
  formattedValue,
  onGoToError,
  onSearchMatchIndexChange,
  onSearchQueryChange,
  onStatusChange,
  onViewChange,
  running,
  searchMatchIndex,
  searchQuery,
  source,
  tree,
  view,
}: Pick<WorkspaceProps, "error" | "running"> & {
  editor: JsonEditorController;
  errorLocation: JsonErrorLocation | null;
  formattedValue: string;
  onGoToError: () => void;
  onSearchMatchIndexChange: (index: number) => void;
  onSearchQueryChange: (query: string) => void;
  onStatusChange: (message: string, tone: JsonNoticeTone) => void;
  onViewChange: (view: JsonResultView) => void;
  searchMatchIndex: number;
  searchQuery: string;
  source: string;
  tree: JsonTreeResult;
  view: JsonResultView;
}) {
  const ready = !running && tree !== null;
  const output = tree?.text ?? source;

  return (
    <div className="relative h-full min-h-0">
      <fieldset
        aria-disabled={!ready || undefined}
        className="m-0 h-full min-w-0 border-0 p-0"
        disabled={!ready}
        inert={!ready}
      >
        <JsonResultRenderer
          artifactValue={output}
          className="h-full [&_header>div:last-child>button]:!text-muted-foreground"
          defaultOpenDepth={1}
          downloadName="smarttools-json-viewer.json"
          editor={editor}
          formattedValue={formattedValue}
          maxVisibleEntries={1_000}
          onCopy={async (value, label) => {
            try {
              await navigator.clipboard.writeText(value);
              onStatusChange(`${label} copied.`, "success");
            } catch {
              onStatusChange("Copy failed. Select the value and copy it manually.", "warning");
            }
          }}
          onSearchMatchIndexChange={onSearchMatchIndexChange}
          onSearchQueryChange={onSearchQueryChange}
          onViewChange={onViewChange}
          persistentSearch
          searchMatchIndex={searchMatchIndex}
          searchQuery={searchQuery}
          selectedPath={ROOT_JSON_TREE_PATH}
          value={tree?.value ?? null}
          view={view}
        />
      </fieldset>
      {!ready ? (
        <JsonResultPlaceholder
          error={error}
          errorLocation={errorLocation}
          onGoToError={onGoToError}
          running={running}
        />
      ) : null}
    </div>
  );
}

export default function JsonViewerWorkspace(props: WorkspaceProps) {
  const editorId = useId();
  const [resultView, setResultView] = useState<JsonResultView>("code");
  const [resultSearchQuery, setResultSearchQuery] = useState("");
  const [resultSearchMatchIndex, setResultSearchMatchIndex] = useState(0);
  const pendingLargeActionRef = useRef<"format" | "minify" | "validate" | null>(null);
  const [transformPreview, setTransformPreview] = useState<JsonTransformPreview>(null);
  const [viewerDraft, setViewerDraft] = useState<JsonViewerDraft | null>(null);
  const tree = useMemo<JsonTreeResult>(
    () =>
      props.result?.render === "json-tree" && typeof props.result.text === "string"
        ? { text: props.result.text, value: props.result.value }
        : null,
    [props.result],
  );
  const acceptedFile = props.spec.input.kind === "text" ? props.spec.input.acceptFiles : undefined;
  const largeFile = isLargeTextFile(props.input.files[0], acceptedFile?.maxEditableBytes);
  const precisionWarning = useMemo(
    () => !largeFile && risksNumericPrecisionLoss(props.input.text),
    [largeFile, props.input.text],
  );
  const errorLocation = useMemo(() => {
    const match = /line (\d+), column (\d+)/i.exec(props.error ?? "");
    return match ? { column: Number(match[2]), line: Number(match[1]) } : null;
  }, [props.error]);
  const displayedTree = transformPreview?.input === props.input.text ? transformPreview : tree;
  const workingOutput = viewerDraft?.code ?? displayedTree?.text ?? props.input.text;
  const workingTree = viewerDraft ? { text: workingOutput, value: viewerDraft.value } : null;
  const formattedViewerValue = viewerDraft
    ? prettyJson(viewerDraft.value)
    : displayedTree
      ? prettyJson(displayedTree.value)
      : props.input.text;

  const goToError = useCallback(() => {
    if (!errorLocation) return;
    const input = document.getElementById(editorId);
    if (!(input instanceof HTMLTextAreaElement)) return;
    const lines = props.input.text.split(/\r\n|\r|\n/);
    const offset =
      lines.slice(0, Math.max(0, errorLocation.line - 1)).reduce((total, line) => total + line.length + 1, 0) +
      Math.max(0, errorLocation.column - 1);
    input.focus();
    input.setSelectionRange(Math.min(offset, props.input.text.length), Math.min(offset + 1, props.input.text.length));
  }, [editorId, errorLocation, props.input.text]);
  const errorIsInPreview = useMemo(() => {
    if (!errorLocation) return false;
    const lines = props.input.text.split(/\r\n|\r|\n/);
    const line = lines[errorLocation.line - 1];
    return line !== undefined && errorLocation.column <= line.length + 1;
  }, [errorLocation, props.input.text]);

  const updateSource = useCallback(
    (text: string) => props.onInputChange({ ...props.input, files: [], text }),
    [props.input, props.onInputChange],
  );
  const applySource = useCallback(
    (text: string, status: string) => {
      const previousSource = props.input.text;
      updateSource(text);
      showJsonNotice(status, "success", {
        label: "Undo",
        onClick: () => {
          updateSource(previousSource);
          showJsonNotice("Last change undone.", "success");
        },
      });
    },
    [props.input.text, updateSource],
  );
  const editorController = useMemo<JsonEditorController>(
    () => ({
      canRedo: Boolean(viewerDraft?.future.length),
      canUndo: Boolean(viewerDraft?.past.length),
      code: viewerDraft?.code ?? "",
      onRedo: () => {
        setViewerDraft((current) => {
          if (!current || current.future.length === 0) return current;
          const next = current.future[current.future.length - 1];
          return {
            ...current,
            ...next,
            future: current.future.slice(0, -1),
            past: [...current.past, { code: current.code, value: current.value }],
          };
        });
      },
      onUndo: () => {
        setViewerDraft((current) => {
          if (!current || current.past.length === 0) return current;
          const previous = current.past[current.past.length - 1];
          return {
            ...current,
            ...previous,
            future: [...current.future, { code: current.code, value: current.value }],
            past: current.past.slice(0, -1),
          };
        });
      },
      onValueChange: (value) => {
        setViewerDraft((current) => {
          if (!current) return current;
          const code = prettyJson(value);
          if (code === prettyJson(current.value)) return current;
          return {
            ...current,
            code,
            future: [],
            past: [...current.past, { code: current.code, value: current.value }],
            value,
          };
        });
      },
    }),
    [viewerDraft],
  );

  useEffect(() => {
    setTransformPreview(null);
    setViewerDraft(null);
  }, [props.input.text]);

  useEffect(() => {
    if (!tree) return;
    setViewerDraft({
      code: tree.text,
      future: [],
      past: [],
      value: tree.value,
    });
  }, [tree]);
  const showTransformResult = useCallback(
    (text: string, value: unknown, status: string) => {
      setResultView("code");
      setTransformPreview({ input: props.input.text, text, value });
      setViewerDraft({
        code: text,
        future: [],
        past: [],
        value,
      });
      showJsonNotice(status, "success");
    },
    [props.input.text],
  );
  const clearSource = useCallback(() => {
    applySource("", "Input cleared.");
  }, [applySource]);
  const repairSource = useCallback(() => {
    if (precisionWarning) {
      showJsonNotice("Repair blocked because it could change a high-precision number.", "warning");
      return;
    }
    const repairMode = props.settings.repairMode === "null" ? "null" : "remove";
    const repaired = describeJsonViewerRepair(props.input.text, repairMode);
    if (!repaired.ok) {
      showJsonNotice(repaired.error.message, "warning");
      return;
    }
    if (
      repairMode === "remove" &&
      repaired.changedPaths.length > 0 &&
      !window.confirm(
        `Repair will remove ${repaired.changedPaths.length} broken ${repaired.changedPaths.length === 1 ? "path" : "paths"}${repaired.changedPaths.length ? ` (${repaired.changedPaths.join(", ")})` : ""}. Continue?`,
      )
    ) {
      showJsonNotice("Repair cancelled. Input was not changed.", "warning");
      return;
    }
    showTransformResult(
      repaired.output,
      JSON.parse(repaired.output) as unknown,
      tree === null
        ? `JSON repaired with the “${repairMode === "null" ? "Set broken values to null" : "Remove broken properties"}” strategy.`
        : "JSON was already valid; formatting was applied.",
    );
  }, [precisionWarning, props.input.text, props.settings.repairMode, showTransformResult, tree]);
  const transformViewerCode = useCallback(
    (mode: "beautify" | "minify") => {
      if (precisionWarning) {
        showJsonNotice(
          `${mode === "minify" ? "Minify" : "Beautify"} blocked because it could change a high-precision number.`,
          "warning",
        );
        return;
      }
      setViewerDraft((current) => {
        if (!current) return current;
        const code = mode === "minify" ? (JSON.stringify(current.value) ?? "null") : prettyJson(current.value);
        if (code === current.code) return current;
        return {
          ...current,
          code,
          future: [],
          past: [...current.past, { code: current.code, value: current.value }],
        };
      });
    },
    [precisionWarning],
  );
  const canTransformCode = Boolean(viewerDraft);
  const requestLargeAction = useCallback(
    (operation: "format" | "minify" | "validate") => {
      if (!props.primaryAction || props.disabled) return;
      pendingLargeActionRef.current = operation;
      props.onSettingChange("largeFileOperation", operation);
    },
    [props.disabled, props.onSettingChange, props.primaryAction],
  );

  useEffect(() => {
    const pendingLargeAction = pendingLargeActionRef.current;
    if (pendingLargeAction === null || props.settings.largeFileOperation !== pendingLargeAction || props.running)
      return;
    const timeout = window.setTimeout(() => {
      if (pendingLargeActionRef.current !== pendingLargeAction) return;
      pendingLargeActionRef.current = null;
      props.primaryAction?.onRun();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [props.primaryAction, props.running, props.settings.largeFileOperation]);
  const loadBrokenExample = useCallback(() => {
    applySource(BROKEN_EXAMPLE, "Broken example loaded. Choose a repair strategy, then run Repair & clean.");
  }, [applySource]);

  const toolbarActions = useMemo<WorkspaceToolbarActions>(
    () => ({
      exampleIcon: <FileText aria-hidden="true" />,
      exampleVariant: "outline",
      statusMeta: errorLocation ? (
        errorIsInPreview ? (
          <GoToJsonError location={errorLocation} onClick={goToError} />
        ) : (
          <span className="text-destructive">Error is beyond the loaded preview</span>
        )
      ) : (
        "UTF-8"
      ),
      before: (
        <div className="flex min-w-0 items-center gap-2 max-[56rem]:w-full max-[56rem]:flex-wrap max-[56rem]:justify-end">
          {largeFile ? (
            <>
              <Button
                disabled={props.disabled || !props.primaryAction}
                onClick={() => requestLargeAction("validate")}
                size="xs"
                type="button"
                variant="default"
              >
                <CircleCheckBig aria-hidden="true" />
                Validate
              </Button>
              <Button
                disabled={props.disabled || !props.primaryAction}
                onClick={() => requestLargeAction("format")}
                size="xs"
                type="button"
                variant="outline"
              >
                <AlignLeft aria-hidden="true" />
                Beautify
              </Button>
              <Button
                disabled={props.disabled || !props.primaryAction}
                onClick={() => requestLargeAction("minify")}
                size="xs"
                type="button"
                variant="outline"
              >
                <Minimize2 aria-hidden="true" />
                Minify
              </Button>
            </>
          ) : (
            <>
              <Button
                disabled={props.disabled || props.input.text.trim().length === 0}
                onClick={repairSource}
                size="xs"
                type="button"
                variant="default"
              >
                <WandSparkles aria-hidden="true" />
                Repair &amp; clean
              </Button>
              {resultView === "code" ? (
                <>
                  <Button
                    aria-label="Beautify JSON code"
                    disabled={props.disabled || !canTransformCode}
                    onClick={() => transformViewerCode("beautify")}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <AlignLeft aria-hidden="true" />
                    Beautify
                  </Button>
                  <Button
                    aria-label="Minify JSON code"
                    disabled={props.disabled || !canTransformCode}
                    onClick={() => transformViewerCode("minify")}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    <Minimize2 aria-hidden="true" />
                    Minify
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      ),
      afterExample: (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!largeFile ? (
            <>
              <Button
                aria-label="Broken example"
                disabled={props.disabled}
                onClick={loadBrokenExample}
                size="xs"
                type="button"
                variant="outline"
              >
                <FileWarning aria-hidden="true" />
                Broken example
              </Button>
              <Select
                disabled={props.disabled}
                onValueChange={(value) => props.onSettingChange("repairMode", value)}
                value={props.settings.repairMode === "null" ? "null" : "remove"}
              >
                <SelectTrigger
                  aria-label="Repair strategy"
                  className="relative w-[168px] gap-1.5 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
                  size="xs"
                >
                  <Caption className="text-muted-foreground">
                    <Strong>REPAIR</Strong>
                  </Caption>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remove">Remove broken</SelectItem>
                  <SelectItem value="null">Set to null</SelectItem>
                </SelectContent>
              </Select>
            </>
          ) : null}
          <Button
            disabled={props.disabled || props.input.text.length === 0}
            onClick={clearSource}
            size="xs"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
            Clear
          </Button>
        </div>
      ),
      exampleLabel: "Example",
      onExample: () => {
        const previousSource = props.input.text;
        showJsonNotice("Sample loaded.", "success", {
          label: "Undo",
          onClick: () => updateSource(previousSource),
        });
      },
    }),
    [
      clearSource,
      canTransformCode,
      loadBrokenExample,
      props.disabled,
      props.input.text,
      props.onSettingChange,
      props.settings.repairMode,
      repairSource,
      requestLargeAction,
      largeFile,
      resultView,
      transformViewerCode,
      displayedTree,
      errorLocation,
      errorIsInPreview,
      goToError,
      updateSource,
    ],
  );

  useEffect(() => {
    props.onToolbarActionsChange?.(toolbarActions);
    return () => props.onToolbarActionsChange?.(null);
  }, [props.onToolbarActionsChange, toolbarActions]);

  useEffect(() => {
    if (!precisionWarning) return;
    showJsonNotice(
      "High-precision number: previews may round it; copy and download preserve the exact source. Transform actions are blocked.",
      "warning",
    );
  }, [precisionWarning]);

  return (
    <>
      <Toaster position="bottom-right" />
      <SplitStack
        className="h-full max-[54rem]:h-[56rem]"
        defaultSize={40}
        maxSize={65}
        minSize={35}
        orientation="horizontal"
      >
        <div className="h-full min-h-0 max-[64.01rem]:h-[286px] max-[42.01rem]:h-[28rem]">
          <JsonSourceEditor
            {...props}
            editorId={editorId}
            onNotice={showJsonNotice}
            onSourceChange={(text) => {
              updateSource(text);
            }}
          />
        </div>
        <div className="h-full min-h-0 max-[64.01rem]:h-[28rem]">
          {largeFile ? (
            <WorkspaceSurface
              className="h-full"
              contentClassName="bg-background"
              meta="Read-only · bounded preview"
              purpose="result"
              title="Large JSON result"
            >
              {props.result ? (
                <ResultView result={props.result} />
              ) : props.error ? (
                <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
                  <div className="max-w-md">
                    <P className="text-destructive">
                      <Strong>JSON validation failed</Strong>
                    </P>
                    <Muted className="mt-1 text-muted-foreground">{props.error}</Muted>
                    {errorLocation && errorIsInPreview ? (
                      <GoToJsonError className="mt-3" location={errorLocation} onClick={goToError} />
                    ) : errorLocation ? (
                      <Muted className="mt-3 text-destructive">
                        The reported location is beyond the loaded preview.
                      </Muted>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
                  <div className="max-w-sm">
                    <P>
                      <Strong>{props.running ? "Processing the complete JSON file" : "Ready to process"}</Strong>
                    </P>
                    <Muted className="mt-1 text-muted-foreground">
                      {props.running
                        ? "The file stays local while the worker reads it incrementally."
                        : "Validate every byte, or generate a formatted or minified download without loading the full file into the editor."}
                    </Muted>
                  </div>
                </div>
              )}
            </WorkspaceSurface>
          ) : (
            <JsonResultPane
              editor={editorController}
              error={props.error}
              errorLocation={errorLocation}
              formattedValue={formattedViewerValue}
              onGoToError={goToError}
              onSearchMatchIndexChange={setResultSearchMatchIndex}
              onSearchQueryChange={setResultSearchQuery}
              onStatusChange={showJsonNotice}
              onViewChange={setResultView}
              running={props.running}
              searchMatchIndex={resultSearchMatchIndex}
              searchQuery={resultSearchQuery}
              source={workingOutput}
              tree={workingTree}
              view={resultView}
            />
          )}
        </div>
      </SplitStack>
    </>
  );
}
