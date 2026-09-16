import type { ComponentType } from "react";
import type { StoredToolArtifact } from "@/lib/tool-framework/artifacts";

export type ToolLifecycle =
  | "empty"
  | "ready"
  | "invalid"
  | "running"
  | "failed"
  | "completed";

export type ToolSettingValue = string | number | boolean;
export type ToolSettings = Record<string, ToolSettingValue>;

export type ToolValidationIssue = {
  column?: number;
  line?: number;
  message: string;
  target?: "input" | "settings" | "workspace";
  targetId?: string;
};

export type ToolArtifact = StoredToolArtifact | {
  storage: "inline";
  content: string;
  mimeType: string;
  name: string;
};

export type ToolFact = {
  label: string;
  value: string;
};

export type ToolExecutionOutcome<Result> = {
  artifacts?: readonly ToolArtifact[];
  facts?: readonly ToolFact[];
  result: Result;
};

export type ToolCommandOutcome<Input> = {
  changes?: readonly string[];
  confirmation?: {
    confirmLabel: string;
    description: string;
    title: string;
  };
  input?: Input;
  notice: string;
  offerUndo?: boolean;
};

export type ToolRuntimeCommand<Input, Settings extends ToolSettings, Result> = (
  context: {
    input: Input;
    result: Result | null;
    settings: Settings;
  },
) => Promise<ToolCommandOutcome<Input>> | ToolCommandOutcome<Input>;

export type ToolRuntimeSpec<
  Input,
  Settings extends ToolSettings,
  Result,
> = {
  commands?: Readonly<
    Record<string, ToolRuntimeCommand<Input, Settings, Result>>
  >;
  debounceMs?: number;
  execute: (
    input: Input,
    settings: Settings,
    signal: AbortSignal,
  ) =>
    | Promise<ToolExecutionOutcome<Result>>
    | ToolExecutionOutcome<Result>;
  initialInput: Input;
  initialSettings: Settings;
  isEmpty: (input: Input) => boolean;
  /** Live tools may require an explicit run for an unusually expensive input. */
  shouldAutoRun?: (input: Input) => boolean;
  trigger: "live" | "manual";
  validate: (
    input: Input,
    settings: Settings,
  ) => readonly ToolValidationIssue[];
};

export type ToolRuntimeController<
  Input,
  Settings extends ToolSettings,
  Result,
> = {
  /** Compiled definition key, never a user label or document identifier. */
  analyticsToolKey?: string;
  artifacts: readonly ToolArtifact[];
  cancelRun: () => void;
  cancelPendingCommand: () => void;
  canUndo: boolean;
  confirmPendingCommand: () => void;
  error: string;
  facts: readonly ToolFact[];
  input: Input;
  issues: readonly ToolValidationIssue[];
  lastChanges: readonly string[];
  lifecycle: ToolLifecycle;
  notice: string;
  pendingConfirmation: ToolCommandOutcome<Input>["confirmation"] | null;
  result: Result | null;
  run: () => void;
  runCommand: (command: string) => Promise<void>;
  setInput: (input: Input) => void;
  setNotice: (notice: string) => void;
  settings: Settings;
  undo: () => void;
  updateSetting: (key: keyof Settings, value: ToolSettingValue) => void;
};

export type ToolSelectSettingDefinition = {
  choices: readonly { label: string; value: string }[];
  helpText?: string;
  key: string;
  kind: "select";
  label: string;
};

export type ToolDefinition = {
  app: "devtools" | "media";
  capabilities: {
    cancel?: boolean;
    copy?: boolean;
    download?: boolean;
    network?: boolean;
  };
  definitionKey: string;
  iconKey: string;
  input: {
    kind: "fields" | "files" | "text";
    label: string;
    maxLength?: number;
  };
  labels: {
    empty: string;
    primaryAction?: string;
    ready: string;
    running: string;
  };
  primaryCommand?: string;
  primaryCommandVisibleWhen?: readonly ToolLifecycle[];
  settings: readonly ToolSelectSettingDefinition[];
  toolbarSize?: "compact" | "default";
  toolId: string;
  trigger: {
    debounceMs?: number;
    mode: "live" | "manual";
  };
};

export type ToolPageComponentProps = {
  account: {
    returnTo: string;
    user: { name: string; isAdmin?: boolean } | null;
  };
  category: string;
  definitionKey: string;
  description: string;
  relatedTools?: readonly {
    href: string;
    label: string;
  }[];
  title: string;
};

export type ToolWorkspaceComponent = ComponentType;
