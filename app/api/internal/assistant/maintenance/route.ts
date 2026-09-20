import config from "@/lib/config/config.ts";
import { handleAssistantMaintenanceRequest } from "@/lib/assistant/cron.ts";
import { captureException } from "@sentry/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAssistantMaintenanceRequest(request, config.assistant.schedulerSecret, async () => {
    try {
      const { cleanupAssistant } = await import("@/lib/assistant/maintenance.ts");
      return await cleanupAssistant();
    } catch (error) {
      captureException(error);
      throw error;
    }
  });
}
