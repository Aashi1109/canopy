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
  actionLabel,
  actionUrl,
}: {
  to: string;
  subject: string;
  heading: string;
  actionLabel: string;
  actionUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM are required");
  }

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: [to],
    subject,
    html: `<main style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;color:#172033"><h1>${escapeHtml(heading)}</h1><p>This link expires automatically. If you did not request it, you can ignore this email.</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#155eef;color:white;text-decoration:none;border-radius:8px">${escapeHtml(actionLabel)}</a></p></main>`,
  });

  if (error) throw new Error("Unable to send authentication email");
}
