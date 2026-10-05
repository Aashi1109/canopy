"use client";

import { useFormatter, useTranslations } from "next-intl";

import { ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import {
  AlertBanner,
  Caption,
  H4,
  Muted,
  Strong,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";
import type { JsonSchemaResult } from "./result";

const RULE_LABELS: Record<string, string> = {
  type: "report.type",
  enum: "report.enum",
  required: "report.required",
  minLength: "report.minLength",
  maxLength: "report.maxLength",
  pattern: "report.pattern",
  schema: "report.schemaRule",
};

function ValidationReport({ result }: { result: JsonSchemaResult }) {
  const t = useTranslations("Tool.runtime");
  const format = useFormatter();
  const { report } = result;
  const passed = report.checks.reduce((count, check) => count + check.passed, 0);
  const failed = report.checks.reduce((count, check) => count + check.failed, 0);
  const empty = passed + failed === 0;
  const rootTypeKey = `report.root.${report.rootType}`;

  return (
    <div
      className="min-h-0 min-w-0 flex-1 space-y-5 overflow-auto p-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
      role="region"
      aria-label={t("report.checks")}
      tabIndex={0}
    >
      <AlertBanner
        variant={failed ? "error" : empty ? "warning" : "success"}
        title={t(failed ? "report.failedTitle" : empty ? "report.emptyTitle" : "report.passedTitle")}
      >
        {t(failed ? "report.failedDescription" : empty ? "report.emptyDescription" : "report.passedDescription")}
        {report.ignoredKeywords.length ? (
          <Caption className="mt-2 block">{t("report.partial", { count: report.ignoredKeywords.length })}</Caption>
        ) : null}
      </AlertBanner>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Muted>{t("report.document", { type: t.has(rootTypeKey) ? t(rootTypeKey) : report.rootType })}</Muted>
          {report.schemaTitle ? (
            <Muted className="break-words">{t("report.schema", { title: report.schemaTitle })}</Muted>
          ) : null}
        </div>
        <dl className="grid grid-cols-3 gap-3 border-y border-border py-3">
          {[
            { label: "report.passed", count: passed, tone: "text-success" },
            { label: "report.failed", count: failed, tone: failed ? "text-destructive" : "text-foreground" },
            { label: "report.values", count: report.valuesChecked, tone: "text-foreground" },
          ].map(({ label, count, tone }) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt>
                <Caption className="text-muted-foreground">{t(label)}</Caption>
              </dt>
              <dd className={`font-heading text-heading-3 font-semibold tabular-nums ${tone}`}>
                {format.number(count)}
              </dd>
            </div>
          ))}
        </dl>
        <Muted>{t("report.valuesHelp")}</Muted>
      </div>

      {result.issues?.length ? (
        <section className="space-y-2" aria-label={t("report.problems")}>
          <H4>{t("report.problems")}</H4>
          <Muted>{t("report.pathHelp")}</Muted>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-destructive">
            {result.issues.map((issue, index) => (
              <li className="break-words pl-1" key={index}>
                {issue.messageRef && t.has(issue.messageRef.key)
                  ? t(issue.messageRef.key, issue.messageRef.values)
                  : issue.message}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {report.checks.length ? (
        <section className="space-y-2" aria-label={t("report.checks")}>
          <H4>{t("report.checks")}</H4>
          <Table aria-label={t("report.checks")}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t("report.rule")}</TableHead>
                <TableHead scope="col" className="text-right">
                  {t("report.passedColumn")}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {t("report.failedColumn")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.checks.map((check) => (
                <TableRow key={check.keyword}>
                  <TableCell className="whitespace-normal">
                    {RULE_LABELS[check.keyword] ? t(RULE_LABELS[check.keyword]) : check.keyword}
                    <Caption className="mt-0.5 block text-muted-foreground">{check.keyword}</Caption>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{format.number(check.passed)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${check.failed ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {format.number(check.failed)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <section className="space-y-2 border-t border-border pt-4" aria-label={t("report.scope")}>
        <H4>{t("report.scope")}</H4>
        <Muted>{t("report.scopeDescription")}</Muted>
        {report.ignoredKeywords.length ? (
          <div className="space-y-1">
            <Strong className="text-sm text-warning">{t("report.ignored")}</Strong>
            <Muted className="break-words">
              {t("report.ignoredDescription", { keywords: report.ignoredKeywords.join(", ") })}
            </Muted>
          </div>
        ) : null}
        {report.schemaDialect ? (
          <Muted className="break-all">{t("report.dialect", { dialect: report.schemaDialect })}</Muted>
        ) : null}
      </section>
    </div>
  );
}

export default function JsonSchemaWorkspace(props: WorkspaceProps) {
  return (
    <ToolWorkspace
      {...props}
      renderPreview={(result: ToolResult) =>
        result.render === "text" && "report" in result ? (
          <ValidationReport result={result as JsonSchemaResult} />
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
