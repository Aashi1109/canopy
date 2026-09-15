import { withDatabaseRequest } from "@smarttools/database/runtime";
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";

type Env = { HYPERDRIVE?: { connectionString: string } };

export default {
  fetch(request: Request, env: Env, ctx: { waitUntil(task: Promise<unknown>): void }) {
    return withDatabaseRequest(
      (waitUntil) => handler.fetch(request, env, new Proxy(ctx, {
        get(target, key) {
          if (key === "waitUntil") return waitUntil;
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      })),
      (task) => ctx.waitUntil(task),
      env.HYPERDRIVE?.connectionString,
    );
  },
};
