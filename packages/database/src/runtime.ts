import { AsyncLocalStorage } from "node:async_hooks";
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

function getSqlClient(): SqlClient {
  const request = requests.getStore();
  if (request?.closed) throw new Error("Database request has finished");
  const existing = request ? request.client : nodeClient;
  if (existing) return existing;
  const databaseUrl = request?.databaseUrl ?? process.env.DATABASE_URL;
  if (request && !databaseUrl) throw new Error("DATABASE_URL is required");
  const client = new pg.Pool({
    connectionString: databaseUrl ?? "postgres://127.0.0.1:1/canopy_unconfigured",
    // Each warm Vercel instance owns its own pool; keep Node connections bounded.
    max: request ? 5 : 1,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
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
