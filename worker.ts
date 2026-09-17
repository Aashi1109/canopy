import { withDatabaseRequest } from "@canopy/database/runtime";
import { runBlogPublishCron, type BlogCronEnv } from "./lib/blog/cron";
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";

type Env = BlogCronEnv & { HYPERDRIVE?: { connectionString: string } };

export default {
  async scheduled(_controller: unknown, env: Env) {
    const counts = await runBlogPublishCron(env);
    if (counts.failed) console.warn("Blog scheduled publishing has failed posts", counts);
    else console.info("Blog scheduled publishing completed", counts);
  },
  fetch(request: Request, env: Env, ctx: { waitUntil(task: Promise<unknown>): void }) {
    return withDatabaseRequest(
      (waitUntil) =>
        handler.fetch(
          request,
          env,
          new Proxy(ctx, {
            get(target, key) {
              if (key === "waitUntil") return waitUntil;
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        ),
      (task) => ctx.waitUntil(task),
      env.HYPERDRIVE?.connectionString,
    );
  },
};
