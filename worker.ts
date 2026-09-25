import { withDatabaseRequest } from "./db/runtime.ts";
import { runBlogPublishCron, type BlogCronEnv } from "./lib/blog/cron";
import { runAssistantMaintenanceCron, type AssistantCronEnv } from "./lib/assistant/cron.ts";
// @ts-ignore OpenNext generates this module during the deployment build.
import handler from "./.open-next/worker.js";

type Env = BlogCronEnv & AssistantCronEnv & { DB?: { connectionString: string } };

export default {
  async scheduled(controller: { cron: string }, env: Env) {
    switch (controller.cron) {
      case "*/30 * * * *": {
        const publishing = await runBlogPublishCron(env);
        if (publishing.failed) console.warn("Blog scheduled publishing has failed posts", publishing);
        else console.info("Blog scheduled publishing completed", publishing);
        break;
      }
      case "0 0,12 * * *": {
        const maintenance = await runAssistantMaintenanceCron(env);
        if (maintenance.failed) console.warn("Assistant maintenance needs retry", maintenance);
        else console.info("Assistant maintenance completed", maintenance);
        break;
      }
    }
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
      env.DB?.connectionString,
    );
  },
};
