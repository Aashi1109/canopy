import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const state = { sent: [], error: null };
globalThis.__authEmailTest = state;
const sourceUrl = new URL("../lib/auth/email.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === sourceUrl && specifier === "resend") {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
          export class Resend {
            emails = { async send(message) {
              const state = globalThis.__authEmailTest;
              state.sent.push(message);
              return { error: state.error };
            } };
          }
        `)}`,
      };
    }
    return next(specifier, context);
  },
});
const { sendAuthEmail } = await import(sourceUrl);
hooks.deregister();
const originalEnv = Object.fromEntries(
  ["RESEND_API_KEY", "ACCOUNTS_EMAIL", "AUTH_EMAIL_FROM"].map((key) => [key, process.env[key]]),
);
test.after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete globalThis.__authEmailTest;
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
  assert.equal(state.sent[0].from, "SmartTools Accounts <accounts@smarttools.lol>");
  assert.deepEqual(state.sent[0].to, [message.to]);
  assert.equal(state.sent[0].subject, message.subject);

  for (const address of [undefined, "", "   "]) {
    if (address === undefined) delete process.env.ACCOUNTS_EMAIL;
    else process.env.ACCOUNTS_EMAIL = address;
    await assert.rejects(sendAuthEmail(message), /ACCOUNTS_EMAIL/);
  }
  process.env.ACCOUNTS_EMAIL = "accounts@smarttools.lol";
  delete process.env.RESEND_API_KEY;
  await assert.rejects(sendAuthEmail(message), /RESEND_API_KEY/);
  assert.equal(state.sent.length, 1);

  process.env.RESEND_API_KEY = "test-key";
  state.error = { message: "Domain not verified" };
  await assert.rejects(sendAuthEmail(message), /Unable to send/);
  assert.equal(state.sent.length, 2);
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
  assert.match(html, /Changed &lt;safely&gt; &amp; successfully\./);
  assert.doesNotMatch(html, /expires automatically|ignore this email/);
});
