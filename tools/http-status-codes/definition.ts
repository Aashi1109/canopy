import type { ToolSpec } from "../../lib/tool-framework/spec";

export default {
  messages: {
    "execution.code": "Code",
    "execution.reasonPhrase": "Reason phrase",
    "execution.errors.no-match": "No matching HTTP status code was found.",
    "execution.recovery.no-match":
      "Try a shorter query, select All categories, or change the search mode to Code + phrase.",
    "status.region": "HTTP status details",
    "status.matches": "{count, plural, one {# matching status code} other {# matching status codes}}",
    "status.copy": "Copy {code}",
    "details.categories.1.label": "1xx · Informational",
    "details.categories.2.label": "2xx · Success",
    "details.categories.3.label": "3xx · Redirection",
    "details.categories.4.label": "4xx · Client error",
    "details.categories.5.label": "5xx · Server error",
    "details.status_details.100.meaning":
      "The server has received the request headers and the client can continue sending the body.",
    "details.status_details.100.next":
      "Continue the request and wait for the final response before treating the operation as complete.",
    "details.status_details.101.meaning": "The server agrees to switch to the protocol requested by the client.",
    "details.status_details.101.next": "Check the Upgrade header and continue using the agreed protocol.",
    "details.status_details.200.meaning": "The request succeeded. The response content depends on the request method.",
    "details.status_details.200.next": "Read the response body and Content-Type for the returned data.",
    "details.status_details.201.meaning": "The request succeeded and created one or more resources.",
    "details.status_details.201.next": "Check the Location header or response body for the newly created resource.",
    "details.status_details.202.meaning":
      "The server accepted the request for processing, but processing is not complete.",
    "details.status_details.202.next":
      "Follow the API''s status or polling instructions. Acceptance does not guarantee eventual success.",
    "details.status_details.204.meaning": "The request succeeded and the server has no response content to send.",
    "details.status_details.204.next": "Treat the operation as successful without attempting to parse a response body.",
    "details.status_details.206.meaning":
      "The server returned the requested portion of a resource in response to a range request.",
    "details.status_details.206.next":
      "Use the Content-Range header or multipart boundaries to place each returned segment correctly.",
    "details.status_details.301.meaning": "The resource has moved permanently to a new URL.",
    "details.status_details.301.next":
      "Check Location and update stored links. Clients may change POST to GET; use 308 when the method must be preserved.",
    "details.status_details.302.meaning": "The resource is temporarily available at another URL.",
    "details.status_details.302.next":
      "Check Location and keep the original URL for future requests. Use 307 when the method must be preserved.",
    "details.status_details.304.meaning":
      "A conditional GET or HEAD request found that the cached representation is still valid.",
    "details.status_details.304.next":
      "Reuse the cached response body and update its metadata from the returned headers.",
    "details.status_details.307.meaning":
      "The resource is temporarily at another URL, and a redirect must preserve the request method.",
    "details.status_details.307.next":
      "Check Location and repeat the request with the same method and body when following the redirect.",
    "details.status_details.308.meaning":
      "The resource has moved permanently, and a redirect must preserve the request method.",
    "details.status_details.308.next":
      "Update stored links using Location and preserve the method and body when following the redirect.",
    "details.status_details.400.meaning":
      "The server cannot process the request because it considers part of the request invalid.",
    "details.status_details.400.next":
      "Check the URL, headers, body format, and any validation details in the response.",
    "details.status_details.401.meaning": "The request lacks valid authentication credentials for this resource.",
    "details.status_details.401.next":
      "Check WWW-Authenticate, then provide or refresh the credentials required by that authentication scheme.",
    "details.status_details.403.meaning": "The server understood the request but refuses to fulfil it.",
    "details.status_details.403.next":
      "Check permissions and server policy. Repeating the same credentials usually will not resolve the refusal.",
    "details.status_details.404.meaning":
      "The server could not find the requested resource, or is unwilling to disclose that it exists.",
    "details.status_details.404.next":
      "Check the URL, route, and resource ID. A 404 alone does not tell you whether the resource is permanently gone.",
    "details.status_details.405.meaning": "The resource does not support the HTTP method used for this request.",
    "details.status_details.405.next": "Check the Allow response header and use a supported method.",
    "details.status_details.408.meaning": "The server timed out while waiting to receive the complete request.",
    "details.status_details.408.next":
      "Check the connection and upload time. Retry on a new connection if repeating the operation is safe.",
    "details.status_details.409.meaning": "The request conflicts with the current state of the resource.",
    "details.status_details.409.next":
      "Read the conflict details, refresh the resource state, and resolve the conflict before retrying.",
    "details.status_details.410.meaning":
      "The resource is no longer available, and the server expects this condition to be permanent.",
    "details.status_details.410.next": "Remove or update the old link and look for a replacement resource.",
    "details.status_details.413.meaning":
      "The request content is larger than the server is willing or able to process.",
    "details.status_details.413.next":
      "Reduce the payload or upload size. If Retry-After is present, the limit may be temporary.",
    "details.status_details.415.meaning":
      "The server does not support the request content''s format or encoding for this operation.",
    "details.status_details.415.next":
      "Check Content-Type, Content-Encoding, and the actual body against the API''s supported formats.",
    "details.status_details.418.meaning":
      "Historically known as I''m a Teapot. Current HTTP semantics reserve this code as unused.",
    "details.status_details.418.next":
      "Check the application''s documentation; this code has no standard production HTTP meaning.",
    "details.status_details.422.meaning":
      "The server understands the content type and syntax but cannot process the supplied instructions.",
    "details.status_details.422.next":
      "Check the response''s validation details and correct the values or business rules in the request.",
    "details.status_details.429.meaning": "Too many requests were sent within the server''s rate-limit window.",
    "details.status_details.429.next": "Respect Retry-After when supplied, slow down requests, and retry with backoff.",
    "details.status_details.500.meaning": "An unexpected server condition prevented the request from being completed.",
    "details.status_details.500.next":
      "Check server logs and request IDs. Retry only when repeating the operation is safe.",
    "details.status_details.501.meaning": "The server does not support the functionality needed to fulfil the request.",
    "details.status_details.501.next": "Check whether the server implements the requested method or feature.",
    "details.status_details.502.meaning": "A gateway or proxy received an invalid response from an upstream server.",
    "details.status_details.502.next": "Check the upstream service, its connection, and the gateway or proxy logs.",
    "details.status_details.503.meaning":
      "The server is temporarily unable to handle the request, often because of overload or maintenance.",
    "details.status_details.503.next":
      "Check service health and respect Retry-After when present. Retry with backoff when safe.",
    "details.status_details.504.meaning":
      "A gateway or proxy did not receive a timely response from an upstream server.",
    "details.status_details.504.next": "Check upstream response times and gateway timeouts before safely retrying.",
    "workspace.what_it_means_eed88f": "What it means",
    "workspace.what_to_check_5d4b90": "What to check",
    "workspace.read_the_http_8b901a": "Read the HTTP specification",
  },
  toolId: "devtools.http-status-codes",
  sharing: { version: 1 },
  app: "devtools",
  slug: "http-status-codes",
  category: "jwt-api-tools",
  keywords: ["http", "status code", "404", "500", "reference", "lookup", "response"],
  name: "HTTP Status Code Lookup",
  description: "Look up common HTTP status codes by code or phrase.",
  resultView: { default: "preview", previewLabel: "Details" },
  input: {
    kind: "fields",
    label: "Status Code or Phrase",
    fields: [
      {
        channel: "text",
        label: "Status code or phrase",
        placeholder: "404",
        required: true,
        multiline: false,
      },
    ],
  },
  settings: {
    fields: {
      category: {
        kind: "select",
        label: "Category",
        help: "Limit results to one HTTP status-code class.",
        default: "all",
        choices: [
          { label: "All categories · 1xx–5xx", value: "all" },
          { label: "1xx · Informational", value: "1xx" },
          { label: "2xx · Success", value: "2xx" },
          { label: "3xx · Redirection", value: "3xx" },
          { label: "4xx · Client error", value: "4xx" },
          { label: "5xx · Server error", value: "5xx" },
        ],
        pane: "main",
      },
      searchMode: {
        kind: "select",
        label: "Search mode",
        help: "Choose whether the query matches codes, reason phrases, or both.",
        default: "code-and-phrase",
        choices: [
          { label: "Code + phrase", value: "code-and-phrase" },
          { label: "Code only", value: "code-only" },
          { label: "Phrase only", value: "phrase-only" },
        ],
      },
    },
  },
  trigger: {
    mode: "live",
  },
  capabilities: {
    copy: true,
  },
  workbenchMark: { text: "404", tone: "contrast" },
  labels: {
    empty: "Type a status code or phrase to search.",
    ready: "HTTP status matches are ready.",
    running: "Searching HTTP status codes…",
  },
  content: {
    howToUse: [
      "Type a number (404), a partial number (40 matches the whole 4xx family listed here), or part of a phrase (gateway).",
      "Results filter as you type. Details explains each status and what to check; Raw keeps the code and reason phrase ready to copy.",
      "Use a shorter query when you want to broaden the result list.",
    ],
    limitations: [
      "This is a curated list of the codes that appear in everyday work, not the complete IANA registry. WebDAV, extension, and vendor-specific codes are not included.",
      "Explanations describe HTTP semantics. A status code alone cannot identify the exact cause in your application.",
      "Matching is a substring search over both the code and the phrase, so short queries match broadly.",
    ],
    faq: [
      {
        q: "Why is a code I expected missing?",
        a: "The list covers the commonly used codes. Rarely seen and vendor-specific codes are deliberately left out to keep results scannable.",
      },
      {
        q: "Can I search by phrase?",
        a: 'Yes. Typing "timeout" returns both 408 Request Timeout and 504 Gateway Timeout.',
      },
    ],
    examples: [
      {
        label: "By code",
        text: "404",
      },
    ],
  },
} as const satisfies ToolSpec;
