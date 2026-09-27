import config from "../config/config.ts";
import { CloudflareEmailSender } from "./senders/cloudflare.ts";

export type EmailProvider = typeof CloudflareEmailSender.type;

export type EmailMessage = {
  from: { address: string; name?: string };
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export abstract class EmailSender {
  abstract readonly type: EmailProvider;
  abstract send(message: EmailMessage): Promise<void>;
}

export function getEmailSender(type?: EmailProvider): EmailSender {
  const provider = type ?? config.email.provider;
  switch (provider) {
    case CloudflareEmailSender.type:
      return new CloudflareEmailSender();
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER. Use ${CloudflareEmailSender.type}.`);
  }
}
