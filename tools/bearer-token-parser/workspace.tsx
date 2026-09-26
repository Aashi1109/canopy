"use client";

import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import { WorkspaceSurface } from "@/components/Surfaces";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import {
  CodeBlock,
  Muted,
  Strong,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@/components/ui/index.tsx";
import { isRecord } from "@/lib/devtools/shared/json";
import type { ToolResult } from "@/lib/tool-framework/result";

const CLAIM_LABELS: Record<string, string> = {
  alg: "Signing algorithm",
  typ: "Token type",
  kid: "Key ID",
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  exp: "Expires at (Unix seconds)",
  nbf: "Not valid before (Unix seconds)",
  iat: "Issued at (Unix seconds)",
  jti: "Token ID",
};

function Claims({ name, value }: { name: "Header" | "Payload"; value: Record<string, unknown> }) {
  return (
    <WorkspaceSurface
      aria-label={`Decoded ${name.toLowerCase()}`}
      purpose="preview"
      title={name}
      description={name === "Header" ? "Algorithm and token metadata" : "Claims supplied by the token"}
      actions={
        <CopyButton content={JSON.stringify(value, null, 2)} iconOnly label={`Copy ${name.toLowerCase()} JSON`} />
      }
    >
      {Object.keys(value).length ? (
        <Table aria-label={`${name} claims`} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-[45%] py-2">
                Field
              </TableHead>
              <TableHead scope="col" className="py-2">
                Value
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(value).map(([key, claim]) => (
              <TableRow key={key}>
                <TableHead scope="row" className="py-2 align-top font-normal whitespace-normal break-words">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <code className="min-w-0 font-mono text-code text-foreground">{key}</code>
                    {Object.hasOwn(CLAIM_LABELS, key) ? <Muted>{CLAIM_LABELS[key]}</Muted> : null}
                  </div>
                </TableHead>
                <TableCell className="py-2 align-top whitespace-normal break-words">
                  {typeof claim === "object" && claim !== null ? (
                    <CodeBlock className="whitespace-pre-wrap break-words">
                      <SyntaxHighlight code={JSON.stringify(claim, null, 2)} language="json" />
                    </CodeBlock>
                  ) : (
                    <Text className="whitespace-pre-wrap">{claim === "" ? '""' : String(claim)}</Text>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Muted className="px-4 py-3">No claims.</Muted>
      )}
    </WorkspaceSurface>
  );
}

function TokenPreview({ result }: { result: ToolResult }) {
  const decoded = result.render === "json-tree" && isRecord(result.value) ? result.value : null;
  const token =
    decoded?.token ??
    (result.render === "key-value" ? result.entries.find((entry) => entry.label === "Token")?.value : undefined);
  const length =
    result.render === "key-value" ? result.entries.find((entry) => entry.label === "Length")?.value : undefined;
  if (typeof token !== "string" || (decoded && (!isRecord(decoded.header) || !isRecord(decoded.payload)))) {
    return <ResultView result={result} />;
  }

  return (
    <ScrollRegion accessibleName="Token preview" className="flex-1">
      <Stack className="@container" gap="none">
        <div className="space-y-1 border-b border-border bg-card px-4 py-3">
          <Strong>{decoded ? "JWT decoded" : "Token extracted"}</Strong>
          <Muted>
            {decoded ? "Header and payload decoded. Signature not verified." : "Token content has not been decoded."}
          </Muted>
        </div>
        <WorkspaceSurface
          aria-label="Extracted token"
          purpose="preview"
          title="Extracted token"
          meta={length ? `${length} characters` : undefined}
          actions={
            <>
              {length ? <CopyButton content={length} iconOnly label="Copy length" /> : null}
              <CopyButton content={token} iconOnly label="Copy token" />
            </>
          }
        >
          <CodeBlock className="bg-muted/30 px-4 py-3 whitespace-pre-wrap break-all">
            <SyntaxHighlight code={token} language="plaintext" />
          </CodeBlock>
        </WorkspaceSurface>
        {decoded && isRecord(decoded.header) && isRecord(decoded.payload) ? (
          <div className="grid min-w-0 border-t border-border @min-[44rem]:grid-cols-2 [&>section+section]:border-t [&>section+section]:border-border @min-[44rem]:[&>section+section]:border-t-0 @min-[44rem]:[&>section+section]:border-l">
            <Claims name="Header" value={decoded.header} />
            <Claims name="Payload" value={decoded.payload} />
          </div>
        ) : null}
      </Stack>
    </ScrollRegion>
  );
}

export default function BearerTokenParserWorkspace(props: WorkspaceProps) {
  return <ToolWorkspace {...props} renderPreview={(result) => <TokenPreview result={result} />} />;
}
