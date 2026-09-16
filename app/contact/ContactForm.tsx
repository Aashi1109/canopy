"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { H2, Muted, Text, AlertBanner, Button, Card, Field, Input, Textarea } from "@smarttools/ui";

type FormState = "idle" | "sending" | "success";

function value(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

export default function ContactForm({ supportEmail }: { supportEmail?: string }) {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!supportEmail) {
      setError("Contact isn’t set up yet. Please use the help resources instead.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = value(form, "name");
    const email = value(form, "email");
    const subject = value(form, "subject");
    const message = value(form, "message");

    if (!name || !email || !subject || !message) {
      setError("Complete every field before sending your message.");
      return;
    }

    setState("sending");
    const body = [`From: ${name} <${email}>`, "", message].join("\n");
    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setState("success");
  }

  if (state === "success") {
    return (
      <Card className="w-full items-center gap-4 px-8 py-12 text-center">
        <div className="grid size-11 place-items-center rounded-lg bg-success-soft text-success">
          <Text>✓</Text>
        </div>
        <H2>Message ready</H2>
        <Muted className="max-w-md text-muted-foreground">
          Your email app should be open with the message filled in. Send it there and we’ll reply
          within one business day.
        </Muted>
        <Button onClick={() => setState("idle")} type="button" variant="ghost">
          Write another message
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full gap-4 p-8">
      {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
      {!supportEmail ? (
        <AlertBanner title="Contact isn’t set up yet" variant="warning">
          No support email has been configured for this deployment. You can keep using every tool
          without an account.
        </AlertBanner>
      ) : null}
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="contact-name" label="Name" variant="auth">
            <Input
              autoComplete="name"
              id="contact-name"
              name="name"
              placeholder="Jane Cooper"
              required
            />
          </Field>
          <Field htmlFor="contact-email" label="Email" variant="auth">
            <Input
              autoComplete="email"
              id="contact-email"
              name="email"
              placeholder="jane@company.com"
              required
              type="email"
            />
          </Field>
        </div>
        <Field htmlFor="contact-subject" label="Subject" variant="auth">
          <Input id="contact-subject" name="subject" placeholder="How can we help?" required />
        </Field>
        <Field htmlFor="contact-message" label="Message" variant="auth">
          <Textarea
            id="contact-message"
            name="message"
            placeholder="Tell us a little about what you need…"
            required
            rows={6}
          />
        </Field>
        <Button className="w-full" disabled={state === "sending"} type="submit">
          {state === "sending" ? "Sending…" : "Send message"}
        </Button>
      </form>
    </Card>
  );
}
