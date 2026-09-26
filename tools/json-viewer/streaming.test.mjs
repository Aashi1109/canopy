import { run } from "./run.worker.ts";
import { payload, testJsonStreamArtifact, testJsonStreamValidation } from "../../tests/helpers/json-streaming.mjs";

testJsonStreamArtifact(
  run,
  "format",
  { largeFileOperation: "format" },
  "smarttools-json-viewer-formatted.json",
  `{\n  "payload": "${payload}",\n  "id": 9007199254740993,\n  "last": false\n}`,
);
testJsonStreamArtifact(
  run,
  "minify",
  { largeFileOperation: "minify" },
  "smarttools-json-viewer-minified.json",
  `{"payload":"${payload}","id":9007199254740993,"last":false}`,
);
testJsonStreamValidation(run, "validate", { largeFileOperation: "validate" });
