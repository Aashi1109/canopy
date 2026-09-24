import { afterAll, expect, test, vi } from "vitest";

// vi.hoisted runs before the hoisted vi.mock factory so the fake Resend client
// can record messages where the test can read them.
const state = vi.hoisted(() => ({ sent: [], error: null }));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = {
      async send(message) {
        state.sent.push(message);
        return { error: state.error };
      },
    };
  },
}));

import { sendAuthEmail } from "@/lib/auth/email.ts";

const originalEnv = Object.fromEntries(
  ["RESEND_API_KEY", "ACCOUNTS_EMAIL", "AUTH_EMAIL_FROM"].map((key) => [key, process.env[key]]),
);
afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("account email uses the shared address and rejects missing configuration or delivery failures", async () => {
  const message = {
    to: "recipient@example.com",
    subject: "Verify your account",
    heading: "Verify your account",
    actionLabel: "Verify email",
    actionUrl: "http://localhost:3000/api/auth/verify-email?token=test",
  };
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_EMAIL_FROM = "Old Sender <old@example.com>";
  process.env.ACCOUNTS_EMAIL = "  accounts@smarttools.lol  ";
  await sendAuthEmail(message);
  expect(state.sent[0].from).toBe("SmartTools Accounts <accounts@smarttools.lol>");
  expect(state.sent[0].to).toEqual([message.to]);
  expect(state.sent[0].subject).toBe(message.subject);

  for (const address of [undefined, "", "   "]) {
    if (address === undefined) delete process.env.ACCOUNTS_EMAIL;
    else process.env.ACCOUNTS_EMAIL = address;
    await expect(sendAuthEmail(message)).rejects.toThrow(/ACCOUNTS_EMAIL/);
  }
  process.env.ACCOUNTS_EMAIL = "accounts@smarttools.lol";
  delete process.env.RESEND_API_KEY;
  await expect(sendAuthEmail(message)).rejects.toThrow(/RESEND_API_KEY/);
  expect(state.sent.length).toBe(1);

  process.env.RESEND_API_KEY = "test-key";
  state.error = { message: "Domain not verified" };
  await expect(sendAuthEmail(message)).rejects.toThrow(/Unable to send/);
  expect(state.sent.length).toBe(2);
});

test("account email supports escaped confirmation copy instead of expiring-link instructions", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ACCOUNTS_EMAIL = "accounts@smarttools.lol";
  state.error = null;
  await sendAuthEmail({
    to: "recipient@example.com",
    subject: "Your password was changed",
    heading: "Password changed",
    message: "Changed <safely> & successfully.",
    actionLabel: "Secure your account",
    actionUrl: "http://localhost:3000/auth?mode=forgot",
  });
  const { html } = state.sent.at(-1);
  expect(html).toMatch(/Changed &lt;safely&gt; &amp; successfully\./);
  expect(html).not.toMatch(/expires automatically|ignore this email/);
});
