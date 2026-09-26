"use client";

import { SyntaxHighlight } from "@/components/content/SyntaxHighlight";
import { CopyButton, ResultView } from "@/components/ResultView";
import { WorkspaceSurface } from "@/components/Surfaces";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { CodeBlock, Muted, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";

const HEADER_CLAIMS: Record<string, string> = {
  alg: "Signing algorithm",
  typ: "Token type",
  cty: "Content type",
  kid: "Key ID",
  jku: "Key set URL",
  jwk: "Public key",
  x5u: "Certificate URL",
  x5c: "Certificate chain",
  x5t: "Certificate thumbprint",
  "x5t#S256": "SHA-256 certificate thumbprint",
  crit: "Critical header parameters",
};

const PAYLOAD_CLAIMS: Record<string, string> = {
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  exp: "Expiration time",
  nbf: "Not valid before",
  iat: "Issued at",
  jti: "Token ID",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function DecodedSection({
  name,
  value,
  timestamps,
}: {
  name: "Header" | "Payload";
  value: Record<string, unknown>;
  timestamps: Record<string, unknown>;
}) {
  const json = JSON.stringify(value, null, 2);
  const descriptions = name === "Header" ? HEADER_CLAIMS : PAYLOAD_CLAIMS;

  return (
    <Tabs defaultValue="json" className="gap-0">
      <WorkspaceSurface
        aria-label={`Decoded ${name.toLowerCase()}`}
        className="[&>[data-slot=workspace-header]]:py-0 [&>[data-slot=workspace-header]>div:last-child]:self-stretch"
        purpose="preview"
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${name === "Header" ? "bg-[var(--syntax-bracket-3)]" : "bg-[var(--syntax-bracket-2)]"}`}
            />
            <span>
              <span className="sr-only">Decoded </span>
              {name.toLowerCase()}
            </span>
          </span>
        }
        actions={
          <>
            <TabsList aria-label={`${name} view`} variant="line" className="mr-2 items-stretch self-stretch border-0">
              <TabsTrigger value="json" className="px-2 py-1.5">
                JSON
              </TabsTrigger>
              <TabsTrigger value="claims" className="px-2 py-1.5">
                Claims
              </TabsTrigger>
            </TabsList>
            <CopyButton content={json} iconOnly label={`Copy ${name.toLowerCase()} JSON`} />
          </>
        }
      >
        <TabsContent value="json">
          <CodeBlock className="bg-muted/30 px-4 py-3 whitespace-pre-wrap break-words">
            <SyntaxHighlight code={json} language="json" />
          </CodeBlock>
        </TabsContent>
        <TabsContent value="claims" className="@container px-4">
          {Object.keys(value).length ? (
            <dl className="divide-y divide-border">
              {Object.entries(value).map(([key, claim]) => (
                <div
                  key={key}
                  className="grid min-w-0 gap-2 py-3 @min-[24rem]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @min-[24rem]:gap-4"
                >
                  <dt className="min-w-0 space-y-1">
                    <CodeBlock className="whitespace-pre-wrap break-all">
                      <SyntaxHighlight code={JSON.stringify(key)} language="json" />
                    </CodeBlock>
                    <Muted>{Object.hasOwn(descriptions, key) ? descriptions[key] : "Custom claim"}</Muted>
                  </dt>
                  <dd className="min-w-0 space-y-1">
                    <CodeBlock className="whitespace-pre-wrap break-words">
                      <SyntaxHighlight code={JSON.stringify(claim, null, 2)} language="json" />
                    </CodeBlock>
                    {name === "Payload" && Object.hasOwn(timestamps, key) && typeof timestamps[key] === "string" ? (
                      <Muted className="break-words">{timestamps[key]} (UTC)</Muted>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <Muted className="py-2">No claims.</Muted>
          )}
        </TabsContent>
      </WorkspaceSurface>
    </Tabs>
  );
}

function JwtPreview({ result }: { result: ToolResult }) {
  let decoded: unknown;
  try {
    decoded = result.render === "text" ? JSON.parse(result.text) : null;
  } catch {
    return <ResultView result={result} language="json" />;
  }
  if (
    !isObject(decoded) ||
    !isObject(decoded.header) ||
    !isObject(decoded.payload) ||
    typeof decoded.signature !== "string"
  ) {
    return <ResultView result={result} language="json" />;
  }

  const timestamps = isObject(decoded.timestamps) ? decoded.timestamps : {};
  return (
    <div className="min-h-0 min-w-0 flex-1 divide-y divide-border overflow-auto">
      <Muted className="px-4 py-2">Decoded only · Signature not verified</Muted>
      <DecodedSection name="Header" value={decoded.header} timestamps={timestamps} />
      <DecodedSection name="Payload" value={decoded.payload} timestamps={timestamps} />
      <WorkspaceSurface
        aria-label="Signature"
        purpose="preview"
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[var(--syntax-string)]" />
            Signature
          </span>
        }
        actions={
          decoded.signature ? <CopyButton content={decoded.signature} iconOnly label="Copy signature" /> : undefined
        }
      >
        {decoded.signature ? (
          <CodeBlock className="bg-muted/30 px-4 py-3 whitespace-pre-wrap break-all text-[var(--syntax-string)]">
            <SyntaxHighlight code={decoded.signature} language="plaintext" />
          </CodeBlock>
        ) : (
          <Muted className="px-4 py-3">
            {decoded.header.alg === "none" ? "Unsigned token (alg: none)." : "No signature provided."}
          </Muted>
        )}
      </WorkspaceSurface>
    </div>
  );
}

export default function JwtDecoderWorkspace(props: WorkspaceProps) {
  return <ToolWorkspace {...props} renderPreview={(result) => <JwtPreview result={result} />} />;
}
