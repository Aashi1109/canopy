import { run } from "./run.worker.ts";
import { payload, testJsonStreamArtifact, testJsonStreamValidation } from "../../tests/helpers/json-streaming.mjs";

testJsonStreamArtifact(
  run,
  "format",
  { operation: "format", indentation: "tab" },
  "smarttools-formatted.json",
  `{\n\t"payload": "${payload}",\n\t"id": 9007199254740993,\n\t"last": false\n}`,
);
testJsonStreamArtifact(
  run,
  "minify",
  { operation: "minify" },
  "smarttools-minified.json",
  `{"payload":"${payload}","id":9007199254740993,"last":false}`,
);
testJsonStreamValidation(run, "validate", { operation: "validate" });
