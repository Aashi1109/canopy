"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { H1, Muted, Overline, P, TextLink, AlertBanner, Button, Card, Field, Input } from "@smarttools/ui";
import { authClient } from "../_lib/authClient";
import { getSafeAuthError, isValidPassword } from "../_lib/security";

export function ResetPasswordForm({ token, returnTo }: { token?: string; returnTo: string }) {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (!isValidPassword(newPassword)) {
      setError("Use 12 to 128 characters for your password.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(undefined);
    const result = await authClient.resetPassword({ newPassword, token });
    if (result.error) {
      setError(getSafeAuthError(result.error));
      setPending(false);
      return;
    }

    setComplete(true);
    setPending(false);
  }

  if (!token) {
    return (
      <Card className="auth-card w-full max-w-[440px] gap-[18px]">
        <Overline className="block text-primary">Invalid link</Overline>
        <H1>Request a new reset email.</H1>
        <Muted className="text-muted-foreground">This reset link is missing, invalid, or has expired.</Muted>
        <Button asChild className="w-full">
          <a href="/auth?mode=forgot">Return to account recovery</a>
        </Button>
      </Card>
    );
  }

  if (complete) {
    return (
      <Card className="auth-card w-full max-w-[440px] gap-[18px]">
        <Overline className="block text-success">Password updated</Overline>
        <H1>Your new password is ready.</H1>
        <Muted className="text-muted-foreground">
          Sign in again. Other sessions were revoked when the reset completed.
        </Muted>
        <Button asChild className="w-full">
          <a href={`/auth?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</a>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="auth-card w-full max-w-[440px] gap-[18px]">
      <div className="auth-heading">
        <H1>Choose a new password</H1>
        <P>Use 12–128 characters. Resetting revokes your existing sessions.</P>
      </div>
      {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
      <form className="grid gap-[18px]" onSubmit={submit}>
        <Field description="12–128 characters" htmlFor="new-password" label="New password" variant="auth">
          <Input
            autoComplete="new-password"
            id="new-password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </Field>
        <Field htmlFor="confirm-new-password" label="Confirm new password" variant="auth">
          <Input
            autoComplete="new-password"
            id="confirm-new-password"
            maxLength={128}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </Field>
        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Card>
  );
}
