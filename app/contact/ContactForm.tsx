"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { H2, Muted, Text, AlertBanner, Button, Card, Field, Input, Textarea } from "@/components/ui/index.tsx";

type FormState = "idle" | "sending" | "success";

function value(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

export default function ContactForm({ supportEmail }: { supportEmail?: string }) {
  const t = useTranslations("Contact");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);

    if (!supportEmail) {
      setError(t("unavailableError"));
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = value(form, "name");
    const email = value(form, "email");
    const subject = value(form, "subject");
    const message = value(form, "message");

    if (!name || !email || !subject || !message) {
      setError(t("incompleteError"));
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
        <H2>{t("successTitle")}</H2>
        <Muted className="max-w-md text-muted-foreground">{t("successDescription")}</Muted>
        <Button onClick={() => setState("idle")} type="button" variant="ghost">
          {t("writeAnother")}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full gap-4 p-8">
      {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
      {!supportEmail ? (
        <AlertBanner title={t("unavailableTitle")} variant="warning">
          {t("unavailableDescription")}
        </AlertBanner>
      ) : null}
      <form
        className="grid gap-4"
        onInvalid={(event) => {
          const input = event.target;
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            input.setCustomValidity(
              input.validity.valueMissing ? t("requiredField") : input.validity.typeMismatch ? t("invalidEmail") : "",
            );
          }
        }}
        onInput={(event) => {
          const input = event.target;
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.setCustomValidity("");
        }}
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="contact-name" label={t("nameLabel")} variant="auth">
            <Input autoComplete="name" id="contact-name" name="name" placeholder="Jane Cooper" required />
          </Field>
          <Field htmlFor="contact-email" label={t("emailLabel")} variant="auth">
            <Input
              autoComplete="email"
              dir="ltr"
              id="contact-email"
              name="email"
              placeholder="jane@company.com"
              required
              type="email"
            />
          </Field>
        </div>
        <Field htmlFor="contact-subject" label={t("subjectLabel")} variant="auth">
          <Input id="contact-subject" name="subject" placeholder={t("subjectPlaceholder")} required />
        </Field>
        <Field htmlFor="contact-message" label={t("messageLabel")} variant="auth">
          <Textarea id="contact-message" name="message" placeholder={t("messagePlaceholder")} required rows={6} />
        </Field>
        <Button className="w-full" disabled={state === "sending"} type="submit">
          {state === "sending" ? t("sending") : t("send")}
        </Button>
      </form>
    </Card>
  );
}
