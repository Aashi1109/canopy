import { convertCsvToJson, parseDelimitedRows } from "../../lib/devtools/shared/csv.ts";
import { utilityDelimiter } from "../../lib/devtools/shared/table.ts";
import type { ToolResult } from "../../lib/tool-framework/result.ts";
import { ToolError, type ToolRun } from "../../lib/tool-framework/run.ts";
import type { SettingsOf } from "../../lib/tool-framework/settings.ts";
import {
  createTextArtifactSink,
  isLargeCsvRun,
  parseCsvRun,
} from "../../lib/devtools/shared/streaming-csv-tool.ts";

type Settings = SettingsOf<typeof import("./definition.ts").default.settings>;

export const run: ToolRun<Settings> = async (ctx): Promise<ToolResult> => {
  const delimiter = utilityDelimiter(ctx.settings.delimiter);
  const normalizeCell = (value: string): string | number => {
    const normalized = ctx.settings.trimWhitespace ? value.trim() : value;
    return ctx.settings.parseNumbers &&
      normalized.trim() !== "" &&
      Number.isFinite(Number(normalized))
      ? Number(normalized)
      : normalized;
  };

  if (isLargeCsvRun(ctx)) {
    const sink = createTextArtifactSink(ctx, {
      mime: "application/json",
      name: "data.json",
    });
    const useHeaders = ctx.settings.firstRowAsHeaders !== false;
    let headers: readonly string[] = [];
    let outputRows = 0;
    try {
      await sink.write("[");
      const parsed = await parseCsvRun(ctx, {
        delimiter,
        onRow: async (row, rowNumber) => {
          if (useHeaders && rowNumber === 1) {
            headers = row.map((header) => header.trim());
            if (headers.some((header) => !header)) {
              throw new ToolError("empty-header", "Every CSV column needs a header.");
            }
            if (new Set(headers).size !== headers.length) {
              throw new ToolError("duplicate-header", "CSV headers must be unique.");
            }
            return;
          }
          const values = row.map(normalizeCell);
          if (ctx.settings.trimWhitespace && values.every((value) => value === "")) return;
          const value = useHeaders
            ? Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
            : values;
          await sink.write(`${outputRows === 0 ? "\n" : ",\n"}  ${JSON.stringify(value)}`);
          outputRows += 1;
        },
        previewRows: 0,
      });
      if (parsed.rowCount === 0) {
        throw new ToolError("empty", "Paste CSV to convert it to JSON.");
      }
      await sink.write(`${outputRows > 0 ? "\n" : ""}]`);
      const artifact = await sink.finish();
      const columnCount = useHeaders ? headers.length : parsed.columnCount;
      return {
        render: "code",
        code: sink.preview,
        language: "json",
        truncated: sink.previewTruncated,
        stats: [
          { label: "Rows", value: String(outputRows) },
          { label: "Columns", value: String(columnCount) },
        ],
        sections: [
          {
            title: sink.previewTruncated ? "Complete JSON file" : "Download",
            body: { render: "files", files: [artifact], outputBytes: artifact.size },
          },
        ],
      };
    } catch (error) {
      await sink.abort(error);
      throw error;
    }
  }

  let output: string;
  let rowCount: number;
  let columnCount: number;

  if (ctx.settings.firstRowAsHeaders !== false) {
    const result = convertCsvToJson(ctx.input.text, { delimiter });
    if (!result.ok) {
      throw new ToolError(
        result.error.kind,
        result.error.message,
        "Check the delimiter, header row, quotes, and field counts, then try again.",
      );
    }

    output = result.output;
    rowCount = result.rowCount;
    columnCount = result.columns.length;
    if (ctx.settings.trimWhitespace || ctx.settings.parseNumbers) {
      const rows = JSON.parse(result.output) as Array<Record<string, string>>;
      const normalizedRows = rows
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([column, value]) => [column, normalizeCell(value)]),
          ),
        )
        .filter(
          (row) => !ctx.settings.trimWhitespace || Object.values(row).some((value) => value !== ""),
        );
      output = JSON.stringify(normalizedRows, null, 2);
      rowCount = normalizedRows.length;
    }
  } else {
    if (!ctx.input.text.trim()) {
      throw new ToolError("empty", "Paste CSV to convert it to JSON.");
    }
    if (ctx.input.text.length > 2_000_000) {
      throw new ToolError("too-large", "CSV must be 2,000,000 characters or fewer.");
    }

    const parsed = parseDelimitedRows(ctx.input.text, delimiter);
    if (!parsed.ok) {
      throw new ToolError("syntax", parsed.message);
    }

    columnCount = parsed.rows[0]?.length ?? 0;
    if (parsed.rows.some((row) => row.length !== columnCount)) {
      throw new ToolError(
        "shape",
        "Every CSV row must have the same number of fields.",
        "Check the delimiter, quotes, and field counts, then try again.",
      );
    }

    const rows = parsed.rows
      .map((row) => row.map(normalizeCell))
      .filter((row) => !ctx.settings.trimWhitespace || row.some((value) => value !== ""));
    output = JSON.stringify(rows, null, 2);
    rowCount = rows.length;
  }

  return {
    render: "text",
    text: output,
    downloadName: "data.json",
    stats: [
      { label: "Rows", value: String(rowCount) },
      { label: "Columns", value: String(columnCount) },
    ],
  };
};

export default run;
