import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { run } from "./run.ts";

const fixtures = JSON.parse(await readFile(new URL("./fixtures.json", import.meta.url), "utf8"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const url = "https://example.com/items?tag=one&tag=two";
const body = '{"count":2}';
const command = [
  "curl --request PATCH",
  `'${url}'`,
  "--header 'Content-Type: application/json'",
  "--header 'X-Example: value with spaces'",
  `--data-raw '${body}'`,
].join(" \\\n  ");
const executionStyles = ["top-level-await", "async-function"];
const responseModes = ["raw", "throw-json"];

function generate(settings = {}, text = command) {
  return run({ input: { text }, settings }).text;
}

function executable(code, settings) {
  const javascript = settings.outputLanguage === "typescript" ? stripTypeScriptTypes(code) : code;
  return new AsyncFunction(
    "fetch",
    `${javascript}\nreturn ${settings.responseHandling === "raw" ? "response" : "data"};`,
  );
}

for (const fixture of fixtures.cases) {
  test(`default and explicit JavaScript preserve ${fixture.name}`, () => {
    const original = generate(fixture.settings, fixture.input.primary);
    assert.equal(original, fixture.expected.output);
    assert.equal(generate({ ...fixture.settings, outputLanguage: "javascript" }, fixture.input.primary), original);
  });
}

for (const outputLanguage of ["javascript", "typescript"]) {
  for (const executionStyle of executionStyles) {
    for (const responseHandling of responseModes) {
      test(`${outputLanguage} ${executionStyle} ${responseHandling} preserves request, response, and failure behavior`, async () => {
        const settings = { outputLanguage, executionStyle, responseHandling };
        const execute = executable(generate(settings), settings);
        const payload = { result: [1, false, null, { name: "Example" }] };
        let jsonCalls = 0;
        const response = {
          ok: true,
          status: 200,
          async json() {
            jsonCalls += 1;
            return payload;
          },
        };
        const requests = [];
        const result = await execute(async (...args) => {
          requests.push(args);
          return response;
        });
        assert.deepEqual(requests, [
          [
            url,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "X-Example": "value with spaces" },
              body,
            },
          ],
        ]);
        assert.equal(result, responseHandling === "raw" ? response : payload);
        assert.equal(jsonCalls, responseHandling === "raw" ? 0 : 1);

        response.ok = false;
        response.status = 503;
        jsonCalls = 0;
        if (responseHandling === "raw") assert.equal(await execute(async () => response), response);
        else
          await assert.rejects(
            execute(async () => response),
            { message: "HTTP 503" },
          );
        assert.equal(jsonCalls, 0);

        const failure = new Error("Connection failed");
        await assert.rejects(
          execute(async () => {
            throw failure;
          }),
          (error) => error === failure,
        );
      });
    }
  }
}

test("generated TypeScript compiles and requires narrowing parsed JSON in every execution style", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canopy-fetch-types-"));
  try {
    const files = [];
    for (const executionStyle of executionStyles) {
      for (const responseHandling of responseModes) {
        const filename = `${executionStyle}-${responseHandling}.mts`;
        const code = generate({ outputLanguage: "typescript", executionStyle, responseHandling });
        const resultCheck =
          responseHandling === "raw"
            ? "const checked: Response = response;"
            : "// @ts-expect-error JSON needs narrowing before accessing properties.\ndata.result;";
        const functionCheck =
          executionStyle !== "async-function"
            ? ""
            : responseHandling === "raw"
              ? "const requestChecked: Promise<Response> = request();"
              : "const requestData = await request();\n// @ts-expect-error The wrapper also exposes unknown JSON.\nrequestData.result;";
        await writeFile(join(directory, filename), `${code}\n${resultCheck}\n${functionCheck}\n`);
        files.push(filename);
      }
    }
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "NodeNext",
          lib: ["ES2022", "DOM"],
          types: [],
        },
        files,
      }),
    );
    const compiler = fileURLToPath(new URL("../bin/tsc", import.meta.resolve("typescript")));
    const checked = spawnSync(process.execPath, [compiler, "--project", directory], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(checked.error, undefined);
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
