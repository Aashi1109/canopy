"use client";
import { useLocale, useTranslations as useToolTranslations } from "next-intl";

import { describeCronSchedule } from "@/lib/devtools/shared/datetime";
import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { CopyButton, ResultView } from "@/components/ResultView";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import {
  CodeBlock,
  H3,
  Muted,
  P,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/index.tsx";

export default function CronParserWorkspace(props: WorkspaceProps) {
  const toolText = useToolTranslations("Tool.runtime");
  const locale = useLocale();
  const expression = props.result?.sections?.find(({ body }) => body.render === "code")?.body;
  const schedule =
    expression?.render === "code" ? describeCronSchedule(expression.code, { translate: toolText, locale }) : undefined;
  // Localized presentation only. The result text, code and canonical rows retain their copy/export values.
  const result =
    props.result && schedule
      ? {
          ...props.result,
          verdict: props.result.verdict && {
            ...props.result.verdict,
            label: toolText("cron.validSchedule"),
            detail: schedule.description,
          },
        }
      : props.result;
  return (
    <ToolWorkspace
      {...props}
      result={result}
      renderResult={(result) =>
        result.verdict?.detail && result.sections ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
            <H3>{result.verdict.detail}</H3>
            {result.sections.map(({ title: originalTitle, titleMessage, body }) => {
              const title = titleMessage ? toolText(titleMessage.key, titleMessage.values) : originalTitle;
              return (
                <section className="space-y-2" key={title} aria-label={title}>
                  {body.render === "code" ? (
                    <>
                      <Muted>{title}</Muted>
                      <div className="flex items-center gap-3">
                        <CodeBlock className="min-w-0 whitespace-pre-wrap break-words">
                          <SyntaxHighlight code={body.code} language={body.language} />
                        </CodeBlock>
                        <CopyButton
                          content={body.code}
                          iconOnly
                          label={toolText("workspace.copy_cron_expression_a3078a")}
                        />
                      </div>
                    </>
                  ) : body.render === "table" ? (
                    <>
                      <P>{title}</P>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {body.columns.map((column, index) => (
                              <TableHead key={column}>
                                {body.columnMessages?.[index]
                                  ? toolText(body.columnMessages[index].key, body.columnMessages[index].values)
                                  : column}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(
                            schedule?.fields.map((field) => [field.label, field.value, field.description]) ?? body.rows
                          ).map(([label, value, meaning]) => (
                            <TableRow key={label}>
                              <TableCell>{label}</TableCell>
                              <TableCell>
                                <CodeBlock>
                                  <SyntaxHighlight code={value} language="crontab" />
                                </CodeBlock>
                              </TableCell>
                              <TableCell className="whitespace-normal">{meaning}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  ) : body.render === "list" ? (
                    (schedule ? [...schedule.notes, toolText("cron.note.timezone")] : body.items).map((note) => (
                      <Muted key={note}>{note}</Muted>
                    ))
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
