import { run } from "./run.worker.ts";
import { payload, testJsonStreamArtifact, testJsonStreamValidation } from "../../tests/helpers/json-streaming.mjs";

testJsonStreamArtifact(
  run,
  "minify",
  {},
  "minified.json",
  `{"payload":"${payload}","id":9007199254740993,"last":false}`,
);
