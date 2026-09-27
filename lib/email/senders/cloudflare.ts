import { z } from "zod";
import config from "../../config/config.ts";
import type { EmailSender, EmailMessage } from "../sender.ts";

const deliveryResponse = z.object({
  success: z.literal(true),
  result: z.object({
    delivered: z.array(z.string()),
    queued: z.array(z.string()),
    permanent_bounces: z.array(z.string()),
    suppressed_recipients: z.array(z.string()).optional(),
  }),
});

export class CloudflareEmailSender implements EmailSender {
  static readonly type = "cloudflare";
  readonly type = CloudflareEmailSender.type;
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor() {
    const { accountId, apiToken } = config.email;
    this.accountId = accountId?.trim() ?? "";
    this.apiToken = apiToken?.trim() ?? "";
    if (!this.accountId || !this.apiToken) {
      throw new Error("CLOUDFLARE_EMAIL_ACCOUNT_ID and CLOUDFLARE_EMAIL_API_TOKEN are required");
    }
  }

  async send(message: EmailMessage): Promise<void> {
    if (message.to.length === 0) throw new Error("At least one email recipient is required");

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/email/sending/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) throw new Error("Email request failed");

      const { result } = deliveryResponse.parse(await response.json());
      const accepted = new Set([...result.delivered, ...result.queued].map((address) => address.toLowerCase()));
      if (
        result.permanent_bounces.length > 0 ||
        (result.suppressed_recipients?.length ?? 0) > 0 ||
        message.to.some((address) => !accepted.has(address.toLowerCase()))
      ) {
        throw new Error("Email delivery failed");
      }
    } catch {
      // Provider responses and network errors can contain credentials or recipient details.
      throw new Error("Unable to send email");
    }
  }
}
