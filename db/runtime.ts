import config from "../lib/config/config.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { startInactiveSpan, type Span } from "@sentry/core";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

type SqlClient = pg.Pool;
type DatabaseRequest = { client?: SqlClient; closed?: boolean; databaseUrl?: string };
const requestKey = Symbol.for("canopy.database.request");
// Next and the custom Worker bundle this module separately. Share their scope.
const runtime = globalThis as typeof globalThis & {
  [requestKey]?: AsyncLocalStorage<DatabaseRequest>;
};
const requests = (runtime[requestKey] ??= new AsyncLocalStorage<DatabaseRequest>());
let nodeClient: SqlClient | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(requests.getStore()?.databaseUrl ?? config.databaseUrl);
}

function observeQueries(client: pg.PoolClient): void {
  client.query = new Proxy(client.query, {
    apply(query, receiver, args) {
      // Custom submittable queries (for example cursors) have their own lifecycle.
      if (typeof args[0]?.submit === "function") return Reflect.apply(query, receiver, args);
      // Starts after pool checkout; includes any waiting in this client's query queue.
      let span: Span | undefined;
      try {
        span = startInactiveSpan({
          name: "db.query",
          op: "db.query",
          onlyIfParent: true,
          attributes: { "db.system": "postgresql" },
        });
      } catch {
        // Observability must never prevent a query from running.
      }
      let reported = false;
      const report = (status: "success" | "error") => {
        if (reported) return;
        reported = true;
        try {
          span?.setStatus({ code: status === "error" ? 2 : 1 });
          span?.end();
        } catch {
          // Observability must never change a query result or error.
        }
      };
      const wrap = (callback: (...values: unknown[]) => unknown) =>
        function (this: unknown, ...values: unknown[]) {
          report(values[0] ? "error" : "success");
          return Reflect.apply(callback, this, values);
        };
      const callbackIndex = typeof args[2] === "function" ? 2 : typeof args[1] === "function" ? 1 : -1;
      if (callbackIndex !== -1) args[callbackIndex] = wrap(args[callbackIndex]);
      else if (typeof args[0]?.callback === "function") {
        args[0] = { ...args[0], callback: wrap(args[0].callback) };
      }
      try {
        const result = Reflect.apply(query, receiver, args);
        return result?.then
          ? result.then(
              (value: unknown) => {
                report("success");
                return value;
              },
              (error: unknown) => {
                report("error");
                throw error;
              },
            )
          : result;
      } catch (error) {
        report("error");
        throw error;
      }
    },
  });
}

function getSqlClient(): SqlClient {
  const request = requests.getStore();
  if (request?.closed) throw new Error("Database request has finished");
  const existing = request ? request.client : nodeClient;
  if (existing) return existing;
  const databaseUrl = request?.databaseUrl ?? config.databaseUrl;
  if (request && !databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new pg.Pool({
    connectionString: databaseUrl ?? "postgres://127.0.0.1:1/canopy_unconfigured",
    // Each warm Vercel instance owns its own pool; keep Node connections bounded.
    max: request ? 5 : config.databasePoolMax,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  client.connect = new Proxy(client.connect, {
    apply(connect, receiver, args) {
      // pg-pool dispatches queued callbacks in the releasing request's context.
      if (typeof args[0] === "function") args[0] = AsyncLocalStorage.bind(args[0]);
      return Reflect.apply(connect, receiver, args);
    },
  });
  client.on("connect", observeQueries);
  client.on("error", (error: NodeJS.ErrnoException) => {
    console.error("Idle database connection failed", { code: error.code });
  });
  if (request) request.client = client;
  else nodeClient = client;
  return client;
}

export const sqlClient = new Proxy({} as SqlClient, {
  get(_target, key) {
    const client = getSqlClient();
    const value = Reflect.get(client, key);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function createDatabase<T extends Record<string, unknown>>(schema: T) {
  type Database = NodePgDatabase<T> & { $client: SqlClient };
  const databases = new WeakMap<SqlClient, Database>();
  const getDatabase = () => {
    const client = getSqlClient();
    let database = databases.get(client);
    if (!database) {
      database = drizzle(client, { schema });
      databases.set(client, database);
    }
    return database;
  };
  return new Proxy({} as Database, {
    get(_target, key) {
      const database = getDatabase();
      const value = Reflect.get(database, key);
      return typeof value === "function" && key !== "$client" ? value.bind(database) : value;
    },
    set(_target, key, value) {
      return Reflect.set(getDatabase(), key, value);
    },
  });
}

export function withDatabaseRequest(
  handler: (waitUntil: (task: Promise<unknown>) => void) => Promise<Response>,
  waitUntil: (task: Promise<unknown>) => void,
  databaseUrl?: string,
): Promise<Response> {
  return requests.run({ databaseUrl }, async () => {
    const request = requests.getStore()!;
    const background: Promise<unknown>[] = [];
    const close = async () => {
      // Background work may schedule more work while the response is streaming.
      while (background.length) await Promise.allSettled(background.splice(0));
      request.closed = true;
      await request.client?.end();
    };
    try {
      const response = await handler((task) => {
        background.push(task);
        waitUntil(task);
      });
      if (!response.body) {
        waitUntil(close());
        return response;
      }
      const stream = new TransformStream<Uint8Array, Uint8Array>();
      // Keep the connection alive for streamed Server Components, including
      // cancellation/error cleanup, without buffering the response in memory.
      waitUntil(response.body.pipeTo(stream.writable).then(close, close));
      return new Response(stream.readable, response);
    } catch (error) {
      waitUntil(close());
      throw error;
    }
  });
}
