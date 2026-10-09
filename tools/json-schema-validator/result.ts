import type { ToolResult } from "../../lib/tool-framework/result.ts";

export type JsonSchemaReport = {
  readonly rootType: string;
  readonly schemaTitle?: string;
  readonly schemaDialect?: string;
  readonly valuesChecked: number;
  readonly checks: readonly {
    readonly keyword: string;
    readonly passed: number;
    readonly failed: number;
  }[];
  readonly ignoredKeywords: readonly string[];
};

export type JsonSchemaResult = Extract<ToolResult, { render: "text" }> & {
  readonly report: JsonSchemaReport;
};
