import config from "../config/config.ts";
import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export async function sendAuthEmail({
  to,
  subject,
  heading,
  message = "This link expires automatically. If you did not request it, you can ignore this email.",
  actionLabel,
  actionUrl,
}: {
  to: string;
  subject: string;
  heading: string;
  message?: string;
  actionLabel: string;
  actionUrl: string;
}): Promise<void> {
  const apiKey = config.email.apiKey;
  const accountsEmail = config.email.accountsEmail?.trim();
  if (!apiKey || !accountsEmail) {
    throw new Error("RESEND_API_KEY and ACCOUNTS_EMAIL are required");
  }

  const { error } = await new Resend(apiKey).emails.send({
    from: `SmartTools Accounts <${accountsEmail}>`,
    to: [to],
    subject,
    html: `<main style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;color:#172033"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#155eef;color:white;text-decoration:none;border-radius:8px">${escapeHtml(actionLabel)}</a></p></main>`,
  });

  if (error) throw new Error("Unable to send authentication email");
}
