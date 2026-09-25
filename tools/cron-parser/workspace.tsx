"use client";

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
  return (
    <ToolWorkspace
      {...props}
      renderResult={(result) =>
        result.verdict?.detail && result.sections ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
            <H3>{result.verdict.detail}</H3>
            {result.sections.map(({ title, body }) => (
              <section className="space-y-2" key={title} aria-label={title}>
                {body.render === "code" ? (
                  <>
                    <Muted>{title}</Muted>
                    <div className="flex items-center gap-3">
                      <CodeBlock className="min-w-0 whitespace-pre-wrap break-words">
                        <SyntaxHighlight code={body.code} language={body.language} />
                      </CodeBlock>
                      <CopyButton content={body.code} iconOnly label="Copy cron expression" />
                    </div>
                  </>
                ) : body.render === "table" ? (
                  <>
                    <P>{title}</P>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {body.columns.map((column) => (
                            <TableHead key={column}>{column}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {body.rows.map(([label, value, meaning]) => (
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
                  body.items.map((note) => <Muted key={note}>{note}</Muted>)
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <ResultView result={result} />
        )
      }
    />
  );
}
