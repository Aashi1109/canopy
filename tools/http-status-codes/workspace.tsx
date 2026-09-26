"use client";

import { CopyButton, ResultView } from "@/components/ResultView";
import { ScrollRegion, Stack } from "@/components/Stacks";
import { ToolWorkspace, type WorkspaceProps } from "@/components/ToolWorkspace";
import { Display, H2, H3, Muted, P, StatusBadge, TextLink } from "@/components/ui/index.tsx";
import type { ToolResult } from "@/lib/tool-framework/result";

const CATEGORIES = {
  "1": { label: "1xx · Informational", variant: "neutral" },
  "2": { label: "2xx · Success", variant: "success" },
  "3": { label: "3xx · Redirection", variant: "info" },
  "4": { label: "4xx · Client error", variant: "warning" },
  "5": { label: "5xx · Server error", variant: "danger" },
} as const;

// Original summaries of RFC 9110, with rate limiting defined in RFC 6585.
const STATUS_DETAILS: Record<string, { meaning: string; next: string; section: string }> = {
  "100": {
    meaning: "The server has received the request headers and the client can continue sending the body.",
    next: "Continue the request and wait for the final response before treating the operation as complete.",
    section: "15.2.1",
  },
  "101": {
    meaning: "The server agrees to switch to the protocol requested by the client.",
    next: "Check the Upgrade header and continue using the agreed protocol.",
    section: "15.2.2",
  },
  "200": {
    meaning: "The request succeeded. The response content depends on the request method.",
    next: "Read the response body and Content-Type for the returned data.",
    section: "15.3.1",
  },
  "201": {
    meaning: "The request succeeded and created one or more resources.",
    next: "Check the Location header or response body for the newly created resource.",
    section: "15.3.2",
  },
  "202": {
    meaning: "The server accepted the request for processing, but processing is not complete.",
    next: "Follow the API's status or polling instructions. Acceptance does not guarantee eventual success.",
    section: "15.3.3",
  },
  "204": {
    meaning: "The request succeeded and the server has no response content to send.",
    next: "Treat the operation as successful without attempting to parse a response body.",
    section: "15.3.5",
  },
  "206": {
    meaning: "The server returned the requested portion of a resource in response to a range request.",
    next: "Use the Content-Range header or multipart boundaries to place each returned segment correctly.",
    section: "15.3.7",
  },
  "301": {
    meaning: "The resource has moved permanently to a new URL.",
    next: "Check Location and update stored links. Clients may change POST to GET; use 308 when the method must be preserved.",
    section: "15.4.2",
  },
  "302": {
    meaning: "The resource is temporarily available at another URL.",
    next: "Check Location and keep the original URL for future requests. Use 307 when the method must be preserved.",
    section: "15.4.3",
  },
  "304": {
    meaning: "A conditional GET or HEAD request found that the cached representation is still valid.",
    next: "Reuse the cached response body and update its metadata from the returned headers.",
    section: "15.4.5",
  },
  "307": {
    meaning: "The resource is temporarily at another URL, and a redirect must preserve the request method.",
    next: "Check Location and repeat the request with the same method and body when following the redirect.",
    section: "15.4.8",
  },
  "308": {
    meaning: "The resource has moved permanently, and a redirect must preserve the request method.",
    next: "Update stored links using Location and preserve the method and body when following the redirect.",
    section: "15.4.9",
  },
  "400": {
    meaning: "The server cannot process the request because it considers part of the request invalid.",
    next: "Check the URL, headers, body format, and any validation details in the response.",
    section: "15.5.1",
  },
  "401": {
    meaning: "The request lacks valid authentication credentials for this resource.",
    next: "Check WWW-Authenticate, then provide or refresh the credentials required by that authentication scheme.",
    section: "15.5.2",
  },
  "403": {
    meaning: "The server understood the request but refuses to fulfil it.",
    next: "Check permissions and server policy. Repeating the same credentials usually will not resolve the refusal.",
    section: "15.5.4",
  },
  "404": {
    meaning: "The server could not find the requested resource, or is unwilling to disclose that it exists.",
    next: "Check the URL, route, and resource ID. A 404 alone does not tell you whether the resource is permanently gone.",
    section: "15.5.5",
  },
  "405": {
    meaning: "The resource does not support the HTTP method used for this request.",
    next: "Check the Allow response header and use a supported method.",
    section: "15.5.6",
  },
  "408": {
    meaning: "The server timed out while waiting to receive the complete request.",
    next: "Check the connection and upload time. Retry on a new connection if repeating the operation is safe.",
    section: "15.5.9",
  },
  "409": {
    meaning: "The request conflicts with the current state of the resource.",
    next: "Read the conflict details, refresh the resource state, and resolve the conflict before retrying.",
    section: "15.5.10",
  },
  "410": {
    meaning: "The resource is no longer available, and the server expects this condition to be permanent.",
    next: "Remove or update the old link and look for a replacement resource.",
    section: "15.5.11",
  },
  "413": {
    meaning: "The request content is larger than the server is willing or able to process.",
    next: "Reduce the payload or upload size. If Retry-After is present, the limit may be temporary.",
    section: "15.5.14",
  },
  "415": {
    meaning: "The server does not support the request content's format or encoding for this operation.",
    next: "Check Content-Type, Content-Encoding, and the actual body against the API's supported formats.",
    section: "15.5.16",
  },
  "418": {
    meaning: "Historically known as I'm a Teapot. Current HTTP semantics reserve this code as unused.",
    next: "Check the application's documentation; this code has no standard production HTTP meaning.",
    section: "15.5.19",
  },
  "422": {
    meaning: "The server understands the content type and syntax but cannot process the supplied instructions.",
    next: "Check the response's validation details and correct the values or business rules in the request.",
    section: "15.5.21",
  },
  "429": {
    meaning: "Too many requests were sent within the server's rate-limit window.",
    next: "Respect Retry-After when supplied, slow down requests, and retry with backoff.",
    section: "6585-4",
  },
  "500": {
    meaning: "An unexpected server condition prevented the request from being completed.",
    next: "Check server logs and request IDs. Retry only when repeating the operation is safe.",
    section: "15.6.1",
  },
  "501": {
    meaning: "The server does not support the functionality needed to fulfil the request.",
    next: "Check whether the server implements the requested method or feature.",
    section: "15.6.2",
  },
  "502": {
    meaning: "A gateway or proxy received an invalid response from an upstream server.",
    next: "Check the upstream service, its connection, and the gateway or proxy logs.",
    section: "15.6.3",
  },
  "503": {
    meaning: "The server is temporarily unable to handle the request, often because of overload or maintenance.",
    next: "Check service health and respect Retry-After when present. Retry with backoff when safe.",
    section: "15.6.4",
  },
  "504": {
    meaning: "A gateway or proxy did not receive a timely response from an upstream server.",
    next: "Check upstream response times and gateway timeouts before safely retrying.",
    section: "15.6.5",
  },
};

function StatusDetails({ result }: { result: ToolResult }) {
  const rows = "tablePreview" in result ? result.tablePreview?.rows : undefined;
  if (!rows?.length) return <ResultView result={result} />;
  const single = rows.length === 1;

  return (
    <ScrollRegion accessibleName="HTTP status details" className="min-h-0 flex-1">
      <div className="@container">
        {!single ? (
          <Muted className="border-b border-border px-5 py-3">{rows.length} matching status codes</Muted>
        ) : null}
        <div className="divide-y divide-border">
          {rows.map(([code, phrase]) => {
            const category = CATEGORIES[code.charAt(0) as keyof typeof CATEGORIES];
            const detail = STATUS_DETAILS[code];
            return (
              <article
                aria-label={`${code} ${phrase}`}
                className={single ? "space-y-6 p-6" : "space-y-3 p-5"}
                key={code}
              >
                <Stack direction="row" align="start" justify="between" gap="md">
                  <Stack direction="row" align="center" gap="md" wrap>
                    {single ? (
                      <Display className="tabular-nums">{code}</Display>
                    ) : (
                      <H2 className="tabular-nums">{code}</H2>
                    )}
                    <div className="space-y-2">
                      {single ? <H2>{phrase}</H2> : <H3>{phrase}</H3>}
                      {category ? <StatusBadge variant={category.variant}>{category.label}</StatusBadge> : null}
                    </div>
                  </Stack>
                  {!single ? <CopyButton content={`${code} ${phrase}`} iconOnly label={`Copy ${code}`} /> : null}
                </Stack>
                {detail ? (
                  <>
                    <div className="max-w-3xl space-y-2">
                      {single ? <H3>What it means</H3> : null}
                      <P>{detail.meaning}</P>
                    </div>
                    {single ? (
                      <div className="max-w-3xl space-y-2 border-t border-border pt-5">
                        <H3>What to check</H3>
                        <P>{detail.next}</P>
                      </div>
                    ) : null}
                    {single ? (
                      <TextLink
                        href={
                          code === "429"
                            ? "https://www.rfc-editor.org/rfc/rfc6585.html#section-4"
                            : `https://www.rfc-editor.org/rfc/rfc9110.html#section-${detail.section}`
                        }
                        rel="noreferrer"
                        target="_blank"
                      >
                        Read the HTTP specification
                      </TextLink>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </ScrollRegion>
  );
}

export default function HttpStatusWorkspace(props: WorkspaceProps) {
  return <ToolWorkspace {...props} renderPreview={(result) => <StatusDetails result={result} />} />;
}
