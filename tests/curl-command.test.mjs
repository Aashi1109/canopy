import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCurl, shellTokens } from "../lib/devtools/shared/curl.ts";
import { run as runAxios } from "../tools/curl-to-axios/run.ts";
import { run as runFetch } from "../tools/curl-to-fetch/run.ts";

const url = "https://httpbin.org/anything?include=customer%2Citems&debug=true&tag=priority&tag=international";
const headers = {
  Authorization: "Bearer example-token",
  "Content-Type": "application/json",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Request-ID": "request-123",
  "Idempotency-Key": "idem-123",
  "X-Custom-Metadata": '{"source":"test","tags":["priority","international"]}',
};
const parts = [
  "curl --request POST",
  `'${url}'`,
  ...Object.entries(headers).map(([name, value]) => `--header '${name}: ${value}'`),
  "--user-agent 'Canopy Example/1.0 (tool tests)'",
];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

for (const [name, newline] of [
  ["LF", "\n"],
  ["CRLF", "\r\n"],
]) {
  const command = parts.join(` \\${newline}  `);

  test(`${name} continuations preserve the absolute cURL URL and quoted headers`, () => {
    assert.deepEqual(parseCurl(command), { url, method: "POST", headers });
    assert.deepEqual(shellTokens(command), shellTokens(parts.join(" ")));
  });

  test(`${name} multiline cURL produces equivalent Axios and Fetch requests without making network calls`, async () => {
    const axios = runAxios({ input: { text: command }, settings: {} });
    assert.equal(axios.render, "text");
    assert.match(axios.issues[0].message, /--user-agent/);
    assert.match(axios.notification.detail, /--user-agent/);
    const axiosRequest = await new AsyncFunction("axios", `${axios.text}\nreturn data;`)(async (config) => ({
      data: config,
    }));
    assert.deepEqual(axiosRequest, { method: "post", url, headers });

    const fetch = runFetch({ input: { text: command }, settings: { responseHandling: "raw" } });
    assert.equal(fetch.render, "text");
    const fetchRequest = await new AsyncFunction("fetch", `${fetch.text}\nreturn response;`)(
      async (requestUrl, options) => ({ url: requestUrl, ...options }),
    );
    assert.deepEqual(fetchRequest, { url, method: "POST", headers });
  });

  test(`${name} continuations work inside double quotes and inside an unquoted argument`, () => {
    assert.deepEqual(shellTokens(`curl "https://exa\\${newline}mple.com/path" -H X-Trace:exa\\${newline}mple`), [
      "curl",
      "https://example.com/path",
      "-H",
      "X-Trace:example",
    ]);
    assert.deepEqual(shellTokens(`curl https://example.com\\${newline}`), ["curl", "https://example.com"]);
  });
}

test("single quotes preserve literal backslashes and newlines instead of treating them as continuations", () => {
  const literal = "line one\\\nline two\\r\\n";
  assert.deepEqual(shellTokens(`curl https://example.com --data-raw '${literal}'`), [
    "curl",
    "https://example.com",
    "--data-raw",
    literal,
  ]);
});

test("a literal escaped backslash is kept before a line break", () => {
  assert.deepEqual(shellTokens(`curl https://example.com --data-raw value\\\\\n-H 'X-Test: yes'`), [
    "curl",
    "https://example.com",
    "--data-raw",
    "value\\",
    "-H",
    "X-Test: yes",
  ]);
});

test("double quotes preserve non-special escapes while escaped spaces and quotes keep one argument", () => {
  assert.deepEqual(
    shellTokens(
      String.raw`curl https://example.com -H "X-Path: C:\temp\files" -H X-Name:\ Jane\ Doe --data-raw "{\"name\":\"Ada\"}"`,
    ),
    [
      "curl",
      "https://example.com",
      "-H",
      String.raw`X-Path: C:\temp\files`,
      "-H",
      "X-Name: Jane Doe",
      "--data-raw",
      '{"name":"Ada"}',
    ],
  );
});

test("unfinished quotes and trailing escapes remain invalid", () => {
  for (const command of ["curl 'https://example.com", "curl https://example.com \\"]) {
    assert.throws(() => shellTokens(command), { code: "invalid-curl" });
  }
});

test("Axios conversion reports every ignored flag through a warning notification", () => {
  const command =
    "curl https://example.com --compressed --location --user-agent 'Canopy Example/1.0' --max-time=10 --compressed";
  const result = runAxios({ input: { text: command }, settings: {} });
  assert.equal(result.render, "text");
  assert.equal(result.notification.level, "warn");
  assert.deepEqual(result.notification.detail.match(/--[a-z-]+/g), [
    "--compressed",
    "--location",
    "--user-agent",
    "--max-time",
  ]);
});

test("supported Axios commands produce code without success or warning notifications", () => {
  const command =
    "curl --request POST https://example.com --header 'Content-Type: application/json' --data-raw '{\"count\":2}' --user example:password";
  const result = runAxios({ input: { text: command }, settings: {} });
  assert.equal(result.render, "text");
  assert.ok(result.text.length > 0);
  assert.equal(result.notification, undefined);
});
