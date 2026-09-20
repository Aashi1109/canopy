import { withDatabaseRequest } from "./db/runtime.ts";
import { runBlogPublishCron, type BlogCronEnv } from "./lib/blog/cron";
import { runAssistantMaintenanceCron, type AssistantCronEnv } from "./lib/assistant/cron.ts";
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";

type Env = BlogCronEnv & AssistantCronEnv & { HYPERDRIVE?: { connectionString: string } };

export default {
  async scheduled(_controller: unknown, env: Env) {
    const [publishing, maintenance] = await Promise.allSettled([
      runBlogPublishCron(env),
      runAssistantMaintenanceCron(env),
    ]);
    if (publishing.status === "fulfilled") {
      if (publishing.value.failed) console.warn("Blog scheduled publishing has failed posts", publishing.value);
      else console.info("Blog scheduled publishing completed", publishing.value);
    }
    if (maintenance.status === "fulfilled") {
      if (maintenance.value.failed) console.warn("Assistant maintenance needs retry", maintenance.value);
      else console.info("Assistant maintenance completed", maintenance.value);
    }
    if (publishing.status === "rejected") throw publishing.reason;
    if (maintenance.status === "rejected") throw maintenance.reason;
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
