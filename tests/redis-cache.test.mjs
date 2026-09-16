import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { Cache } from "@smarttools/cache";

test("caller-owned cache namespaces support get/set/delete, TTLs, fallback and validation", async (t) => {
  const variables = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  Object.assign(process.env, {
    UPSTASH_REDIS_REST_URL: "https://cache.example.test",
    UPSTASH_REDIS_REST_TOKEN: "private-token",
  });
  const stored = new Map();
  const calls = [];
  const warnings = [];
  let now = 0;
  let failure;
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  t.mock.method(axios, "post", async (_url, command, options) => {
    calls.push(command);
    assert.equal(options.headers.Authorization, "Bearer private-token");
    assert.equal(options.timeout, 1_000);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.maxRedirects, 0);
    if (failure) return failure(command);
    const [operation, key, value, expiry, seconds] = command;
    let result;
    if (operation === "GET") {
      const entry = stored.get(key);
      result = entry && entry.expires > now ? entry.value : null;
    } else if (operation === "SET") {
      assert.equal(expiry, "EX");
      stored.set(key, { value, expires: now + Number(seconds) });
      result = "OK";
    } else {
      assert.equal(operation, "DEL");
      result = Number(stored.delete(key));
    }
    return { data: { result } };
  });

  const roles = new Cache("roles");
  const catalog = new Cache("catalog");
  assert.equal(await roles.get("all"), null);
  await roles.set("all", ["editor"], 10);
  assert.deepEqual(await roles.get("all"), ["editor"]);
  assert.equal(await catalog.get("all"), null);
  assert.equal(await roles.get("different"), null);
  assert.deepEqual(calls[1], ["SET", "roles:all", '["editor"]', "EX", "10"]);
  await new Cache("my:literal namespace").set("my:key", []);
  assert.equal(calls.at(-1)[1], "my:literal namespace:my:key");
  assert.equal(calls.at(-1).at(-1), "300");
  now = 11;
  assert.equal(await roles.get("all"), null);

  let loads = 0;
  const load = async () => [`value-${++loads}`];
  assert.deepEqual(await roles.remember("all", load), ["value-1"]);
  assert.deepEqual(await roles.remember("all", load), ["value-1"]);
  assert.equal(loads, 1);
  await roles.delete("all");
  assert.deepEqual(await roles.remember("all", load), ["value-2"]);

  stored.set("roles:all", { value: "{broken", expires: Infinity });
  assert.deepEqual(await roles.remember("all", load), ["value-3"]);
  for (const response of [
    () => {
      throw new Error("private-token postgres://private-database");
    },
    () => ({ data: { error: "private-token" } }),
    () => ({ data: { result: { unexpected: true } } }),
    () => {
      throw new axios.AxiosError("Request failed with status code 503", "ERR_BAD_RESPONSE");
    },
  ]) {
    failure = response;
    const previousLoads = loads;
    assert.equal(await roles.get("all"), null);
    assert.deepEqual(await roles.remember("all", load), [`value-${previousLoads + 1}`]);
    await roles.set("all", []);
    await roles.delete("all");
  }
  failure = (command) =>
    command[0] === "GET"
      ? { data: { result: null } }
      : Promise.reject(new Error("write failed private-token"));
  const previousLoads = loads;
  assert.deepEqual(await roles.remember("all", load), [`value-${previousLoads + 1}`]);
  await assert.rejects(
    () =>
      roles.remember("all", async () => {
        throw new Error("DB unavailable");
      }),
    /DB unavailable/,
  );
  failure = undefined;
  assert.ok(
    warnings.every(
      (warning) => !warning.includes("private-token") && !warning.includes("postgres://"),
    ),
  );

  for (const namespace of ["", " "]) assert.throws(() => new Cache(namespace), /namespace/);
  await assert.rejects(() => roles.get(""), /key/);
  await assert.rejects(() => roles.set("", []), /key/);
  await assert.rejects(() => roles.delete(""), /key/);
  for (const ttl of [0, -1, 1.5, Infinity, NaN]) {
    await assert.rejects(() => roles.set("all", [], ttl), /positive integer/);
  }

  for (const variable of variables) {
    const saved = process.env[variable];
    delete process.env[variable];
    const previousCalls = calls.length;
    const previousLoads = loads;
    assert.equal(await roles.get("all"), null);
    await roles.remember("all", load);
    await roles.set("all", []);
    await roles.delete("all");
    assert.equal(loads, previousLoads + 1);
    assert.equal(calls.length, previousCalls);
    process.env[variable] = saved;
  }
});
