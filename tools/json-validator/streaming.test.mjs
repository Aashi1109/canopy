import { run } from "./run.worker.ts";
import { payload, testJsonStreamArtifact, testJsonStreamValidation } from "../../tests/helpers/json-streaming.mjs";

testJsonStreamValidation(run, "validate", {});
