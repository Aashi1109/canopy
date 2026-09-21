import assert from "node:assert/strict";
import test from "node:test";

import { getJsonPathSuggestions, resolveJsonPath } from "../tools/json-path-tester/json-path.ts";
import { run } from "../tools/json-path-tester/run.ts";

const value = {
  users: [
    { name: "Ada", age: 28, profile: { city: "Pune" } },
    { name: "Lin", active: false },
  ],
  count: 0,
  note: null,
};

test("JSON paths accept the optional document root without changing matches", () => {
  for (const path of ["$.users[0].name", "users[0].name", ".users[0].name", "  users[0].name  "]) {
    assert.equal(resolveJsonPath(value, path), "Ada");
  }
  assert.equal(resolveJsonPath(value.users, "[0].name"), "Ada");
  assert.equal(resolveJsonPath(value, "$"), value);
  assert.deepEqual(resolveJsonPath(value, "users[*].name"), ["Ada", "Lin"]);
  assert.deepEqual(resolveJsonPath(value, "users.*.name"), ["Ada", "Lin"]);
  assert.equal(resolveJsonPath(value, "users[*].active"), false);
  assert.equal(resolveJsonPath(value, "count"), 0);
  assert.equal(resolveJsonPath(value, "note"), null);
});

test("quoted paths preserve literal dots, spaces, empty keys, and escaped characters", () => {
  const document = {
    "a.b": { "full name": "Ada" },
    "": 0,
    'say"hi': true,
    "it's": false,
    "slash\\key": 1,
    "line\nfeed": 2,
  };
  assert.equal(resolveJsonPath(document, '["a.b"]["full name"]'), "Ada");
  assert.equal(resolveJsonPath(document, "$['a.b']['full name']"), "Ada");
  assert.equal(resolveJsonPath(document, '[""]'), 0);
  assert.equal(resolveJsonPath(document, '["say\\\"hi"]'), true);
  assert.equal(resolveJsonPath(document, "['it\\'s']"), false);
  assert.equal(resolveJsonPath(document, '["slash\\\\key"]'), 1);
  assert.equal(resolveJsonPath(document, '["line\\nfeed"]'), 2);
  assert.equal(resolveJsonPath({ name: "Ada" }, '["\\u006eame"]'), "Ada");
});

test("invalid syntax, empty input, and missing values return actionable errors", () => {
  for (const path of ["", "  "]) assert.throws(() => resolveJsonPath(value, path), { code: "path-required" });
  for (const path of [
    "$..name",
    "users[?(@.age)]",
    "users[0:2]",
    "users[0,1]",
    "users[",
    "users.",
    "users[0]name",
    "$users",
    "users[-1]",
    "users[1.5]",
  ]) {
    assert.throws(() => resolveJsonPath(value, path), { code: "path-unsupported" });
  }
  for (const path of ["users[99]", "users[0].missing", "missing", "users.length", "users[999999999999999999999999]"]) {
    assert.throws(() => resolveJsonPath(value, path), { code: "path-no-match" });
  }
});

test("paths and suggestions only access own properties", () => {
  const document = Object.assign(Object.create({ inherited: "secret" }), { visible: 1 });
  for (const path of ["inherited", "toString", "constructor", "__proto__"]) {
    assert.throws(() => resolveJsonPath(document, path), { code: "path-no-match" });
  }
  assert.deepEqual(resolveJsonPath(document, "$.*"), 1);
  assert.deepEqual(getJsonPathSuggestions(document, ""), ["visible"]);
  const explicitKey = JSON.parse('{"__proto__":"data"}');
  assert.equal(resolveJsonPath(explicitKey, "__proto__"), "data");
});

test("suggestions complete root and nested keys in the entered path style", () => {
  assert.ok(getJsonPathSuggestions(value, "").includes("users"));
  assert.deepEqual(getJsonPathSuggestions(value, "us"), ["users"]);
  assert.deepEqual(getJsonPathSuggestions(value, "$.us"), ["$.users"]);
  assert.deepEqual(getJsonPathSuggestions(value, ".us"), [".users"]);
  assert.ok(getJsonPathSuggestions(value, "$").includes("$.users"));
  assert.ok(getJsonPathSuggestions(value, "users[0].").includes("users[0].name"));
  assert.deepEqual(getJsonPathSuggestions(value, "users[0].na"), ["users[0].name"]);
  assert.ok(getJsonPathSuggestions(value, "users[0].profile").includes("users[0].profile.city"));
  assert.deepEqual(getJsonPathSuggestions(value, "users[0].name"), []);
  const crowded = {
    parent: { child: true },
    ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`parent${i}`, i])),
  };
  assert.ok(getJsonPathSuggestions(crowded, "parent").includes("parent.child"));
});

test("suggestions offer array indices, wildcards, and merged children", () => {
  assert.ok(getJsonPathSuggestions(value, "users").includes("users[*]"));
  assert.ok(getJsonPathSuggestions(value, "users[").includes("users[0]"));
  assert.ok(getJsonPathSuggestions(value, "users[0").includes("users[0]"));
  assert.ok(getJsonPathSuggestions(value, "users.").includes("users.*"));
  assert.ok(getJsonPathSuggestions(value, "users[*].").includes("users[*].active"));
  assert.ok(getJsonPathSuggestions(value.users, "[").includes("[0]"));
  assert.deepEqual(getJsonPathSuggestions(value, "users[99]."), []);
  assert.deepEqual(getJsonPathSuggestions(value, "users.na"), []);
  assert.deepEqual(getJsonPathSuggestions(value, "$.."), []);
});

test("suggestions quote special keys and every returned candidate evaluates", () => {
  const document = {
    "a.b": { 'say"hi': true, "it's": false, "slash\\key": null },
    "full name": "Ada",
    normal: 1,
    "": 0,
  };
  assert.ok(getJsonPathSuggestions(document, "a").includes('["a.b"]'));
  assert.ok(getJsonPathSuggestions(document, "['a").includes("['a.b']"));
  assert.ok(getJsonPathSuggestions(document, '["a.b"].').includes('["a.b"]["say\\\"hi"]'));
  for (const path of ["", "$", "a", "['a", '["', '["a.b"]', '["a.b"].', '["a.b"]["', '["a.b"][\'']) {
    for (const candidate of getJsonPathSuggestions(document, path)) {
      assert.doesNotThrow(() => resolveJsonPath(document, candidate), candidate);
    }
  }
});

test("suggestions cap results and bound wildcard traversal on large inputs", () => {
  const wide = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`key${i}`, i]));
  assert.equal(getJsonPathSuggestions(wide, "").length, 30);
  const large = Array.from({ length: 10000 }, (_, i) => ({ [`field${i}`]: i }));
  assert.ok(getJsonPathSuggestions(large, "[*].").length <= 30);
  assert.deepEqual(getJsonPathSuggestions(null, ""), []);
});

test("execution accepts rootless paths and retains JSON repair behavior", async () => {
  const result = await run({
    input: { text: '{"users":[{"name":"Ada",}]}', files: [] },
    settings: { path: "users[0].name", repairMode: "remove" },
    signal: new AbortController().signal,
  });
  assert.equal(result.render, "text");
  assert.equal(result.text, '"Ada"');
});
