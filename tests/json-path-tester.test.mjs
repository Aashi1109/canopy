import { expect, test } from "vitest";
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
    expect(resolveJsonPath(value, path)).toBe("Ada");
  }
  expect(resolveJsonPath(value.users, "[0].name")).toBe("Ada");
  expect(resolveJsonPath(value, "$")).toBe(value);
  expect(resolveJsonPath(value, "users[*].name")).toEqual(["Ada", "Lin"]);
  expect(resolveJsonPath(value, "users.*.name")).toEqual(["Ada", "Lin"]);
  expect(resolveJsonPath(value, "users[*].active")).toBe(false);
  expect(resolveJsonPath(value, "count")).toBe(0);
  expect(resolveJsonPath(value, "note")).toBe(null);
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
  expect(resolveJsonPath(document, '["a.b"]["full name"]')).toBe("Ada");
  expect(resolveJsonPath(document, "$['a.b']['full name']")).toBe("Ada");
  expect(resolveJsonPath(document, '[""]')).toBe(0);
  expect(resolveJsonPath(document, '["say\\\"hi"]')).toBe(true);
  expect(resolveJsonPath(document, "['it\\'s']")).toBe(false);
  expect(resolveJsonPath(document, '["slash\\\\key"]')).toBe(1);
  expect(resolveJsonPath(document, '["line\\nfeed"]')).toBe(2);
  expect(resolveJsonPath({ name: "Ada" }, '["\\u006eame"]')).toBe("Ada");
});

test("invalid syntax, empty input, and missing values return actionable errors", () => {
  for (const path of ["", "  "])
    expect(() => resolveJsonPath(value, path)).toThrow(expect.objectContaining({ code: "path-required" }));
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
    expect(() => resolveJsonPath(value, path)).toThrow(expect.objectContaining({ code: "path-unsupported" }));
  }
  for (const path of ["users[99]", "users[0].missing", "missing", "users.length", "users[999999999999999999999999]"]) {
    expect(() => resolveJsonPath(value, path)).toThrow(expect.objectContaining({ code: "path-no-match" }));
  }
});

test("paths and suggestions only access own properties", () => {
  const document = Object.assign(Object.create({ inherited: "secret" }), { visible: 1 });
  for (const path of ["inherited", "toString", "constructor", "__proto__"]) {
    expect(() => resolveJsonPath(document, path)).toThrow(expect.objectContaining({ code: "path-no-match" }));
  }
  expect(resolveJsonPath(document, "$.*")).toEqual(1);
  expect(getJsonPathSuggestions(document, "")).toEqual(["visible"]);
  const explicitKey = JSON.parse('{"__proto__":"data"}');
  expect(resolveJsonPath(explicitKey, "__proto__")).toBe("data");
});

test("suggestions complete root and nested keys in the entered path style", () => {
  expect(getJsonPathSuggestions(value, "").includes("users")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "us")).toEqual(["users"]);
  expect(getJsonPathSuggestions(value, "$.us")).toEqual(["$.users"]);
  expect(getJsonPathSuggestions(value, ".us")).toEqual([".users"]);
  expect(getJsonPathSuggestions(value, "$").includes("$.users")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[0].").includes("users[0].name")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[0].na")).toEqual(["users[0].name"]);
  expect(getJsonPathSuggestions(value, "users[0].profile").includes("users[0].profile.city")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[0].name")).toEqual([]);
  const crowded = {
    parent: { child: true },
    ...Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`parent${i}`, i])),
  };
  expect(getJsonPathSuggestions(crowded, "parent").includes("parent.child")).toBeTruthy();
});

test("suggestions offer array indices, wildcards, and merged children", () => {
  expect(getJsonPathSuggestions(value, "users").includes("users[*]")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[").includes("users[0]")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[0").includes("users[0]")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users.").includes("users.*")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[*].").includes("users[*].active")).toBeTruthy();
  expect(getJsonPathSuggestions(value.users, "[").includes("[0]")).toBeTruthy();
  expect(getJsonPathSuggestions(value, "users[99].")).toEqual([]);
  expect(getJsonPathSuggestions(value, "users.na")).toEqual([]);
  expect(getJsonPathSuggestions(value, "$..")).toEqual([]);
});

test("suggestions quote special keys and every returned candidate evaluates", () => {
  const document = {
    "a.b": { 'say"hi': true, "it's": false, "slash\\key": null },
    "full name": "Ada",
    normal: 1,
    "": 0,
  };
  expect(getJsonPathSuggestions(document, "a").includes('["a.b"]')).toBeTruthy();
  expect(getJsonPathSuggestions(document, "['a").includes("['a.b']")).toBeTruthy();
  expect(getJsonPathSuggestions(document, '["a.b"].').includes('["a.b"]["say\\\"hi"]')).toBeTruthy();
  for (const path of ["", "$", "a", "['a", '["', '["a.b"]', '["a.b"].', '["a.b"]["', '["a.b"][\'']) {
    for (const candidate of getJsonPathSuggestions(document, path)) {
      expect(() => resolveJsonPath(document, candidate), candidate).not.toThrow();
    }
  }
});

test("suggestions cap results and bound wildcard traversal on large inputs", () => {
  const wide = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`key${i}`, i]));
  expect(getJsonPathSuggestions(wide, "").length).toBe(30);
  const large = Array.from({ length: 10000 }, (_, i) => ({ [`field${i}`]: i }));
  expect(getJsonPathSuggestions(large, "[*].").length <= 30).toBeTruthy();
  expect(getJsonPathSuggestions(null, "")).toEqual([]);
});

test("execution accepts rootless paths and retains JSON repair behavior", async () => {
  const result = await run({
    input: { text: '{"users":[{"name":"Ada",}]}', files: [] },
    settings: { path: "users[0].name", repairMode: "remove" },
    signal: new AbortController().signal,
  });
  expect(result.render).toBe("text");
  expect(result.text).toBe('"Ada"');
});
