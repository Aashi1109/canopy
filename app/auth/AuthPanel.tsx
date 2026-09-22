"use client";

import { Mail, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Caption,
  Label,
  H1,
  P,
  Strong,
  Text,
  TextLink,
  AlertBanner,
  Button,
  Card,
  CheckboxControl,
  Field,
  FieldLegend,
  FieldSet,
  Input,
  Separator,
  toast,
} from "@/components/ui/index.tsx";
import { authClient } from "./_lib/authClient";
import { getSafeAuthError, isEmailVerificationError, isValidPassword } from "./_lib/security";

export type AuthMode = "sign-in" | "sign-up" | "forgot";
type Feedback = { kind: "error"; text: string } | null;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function AuthNotice({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: ReactNode }) {
  return (
    <div className="auth-notice">
      <span aria-hidden="true">{icon}</span>
      <div>
        <Strong>{title}</Strong>
        <P>{children}</P>
      </div>
    </div>
  );
}

export function AuthPanel({
  returnTo,
  initialError,
  initialMode = "sign-in",
  publicOrigin = "",
}: {
  returnTo: string;
  initialError?: string;
  initialMode?: AuthMode;
  publicOrigin?: string;
}) {
  const panelId = useId();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>(initialError ? { kind: "error", text: initialError } : null);

  function chooseMode(nextMode: AuthMode) {
    setMode(nextMode);
    setFeedback(null);
    setVerificationEmail(undefined);
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);

    const form = new FormData(event.currentTarget);
    const email = field(form, "email").toLowerCase();
    const password = field(form, "password");
    setVerificationEmail(undefined);

    if (!email || !password) {
      setFeedback({ kind: "error", text: "Enter your email and password." });
      setPending(false);
      return;
    }

    try {
      if (mode === "sign-up") {
        const name = field(form, "name");
        if (!name || name.length > 100) {
          setFeedback({ kind: "error", text: "Enter a name under 100 characters." });
          return;
        }
        if (!isValidPassword(password)) {
          setFeedback({ kind: "error", text: "Use 12 to 128 characters for your password." });
          return;
        }
        if (!termsAccepted) {
          setFeedback({
            kind: "error",
            text: "Agree to the Terms of Service and Privacy Policy to continue.",
          });
          return;
        }

        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: returnTo,
        });
        if (result.error) {
          setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
        } else {
          setVerificationEmail(email);
          toast.success("Account created", {
            description: "Check your inbox to verify your email before signing in.",
          });
        }
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: returnTo,
      });
      if (result.error) {
        if (isEmailVerificationError(result.error)) {
          setVerificationEmail(email);
        } else {
          setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
        }
        return;
      }

      window.location.assign(returnTo);
    } catch (error) {
      setFeedback({ kind: "error", text: getSafeAuthError(error) });
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setFeedback(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnTo,
      });
      if (result.error) {
        setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
        setPending(false);
      }
    } catch (error) {
      setFeedback({ kind: "error", text: getSafeAuthError(error) });
      setPending(false);
    }
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    const email = field(new FormData(event.currentTarget), "email").toLowerCase();
    if (!email) {
      setFeedback({ kind: "error", text: "Enter your email address." });
      setPending(false);
      return;
    }

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `/auth/reset-password?returnTo=${encodeURIComponent(returnTo)}`,
      });
      if (result.error) {
        setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
      } else {
        toast.success("If that account exists, a password-reset link is on its way.");
      }
    } catch (error) {
      setFeedback({ kind: "error", text: getSafeAuthError(error) });
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    if (!verificationEmail) return;
    setPending(true);
    setFeedback(null);
    try {
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
        callbackURL: returnTo,
      });
      if (result.error) {
        setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
      } else {
        toast.success("If the account still needs verification, a new link is on its way.");
      }
    } catch (error) {
      setFeedback({ kind: "error", text: getSafeAuthError(error) });
    } finally {
      setPending(false);
    }
  }

  if (verificationEmail) {
    return (
      <Card
        aria-labelledby={`${panelId}-verification-title`}
        className="auth-card w-full max-w-[440px] gap-[18px]"
        role="region"
      >
        <div className="auth-heading" role="status">
          <Caption>{mode === "sign-up" ? "Account created · Verify email" : "Email verification required"}</Caption>
          <H1 id={`${panelId}-verification-title`} tabIndex={-1} ref={(node) => node?.focus()}>
            Check your inbox
          </H1>
          <P>Open the verification link sent to</P>
          <Strong className="block break-words [overflow-wrap:anywhere]">{verificationEmail}</Strong>
        </div>

        <P>
          Follow the link to verify your email and continue. If you’ve already verified in another browser, sign in
          below.
        </P>
        {feedback ? <AlertBanner variant={feedback.kind}>{feedback.text}</AlertBanner> : null}

        <div className="grid gap-3">
          <Button className="w-full" disabled={pending} onClick={() => chooseMode("sign-in")} type="button">
            Sign in
          </Button>
          <Button className="w-full" disabled={pending} onClick={resendVerification} type="button" variant="outline">
            {pending ? "Sending…" : "Resend email"}
          </Button>
        </div>
        <Caption>Can’t find it? Check your spam folder, or request another email.</Caption>
        <div className="auth-card-footer-link">
          <Text>Wrong email address?</Text>
          <button disabled={pending} onClick={() => chooseMode(mode)} type="button">
            <Caption>Go back</Caption>
          </button>
        </div>
      </Card>
    );
  }

  const isSignUp = mode === "sign-up";
  const isForgot = mode === "forgot";

  return (
    <Card aria-labelledby={`${panelId}-title`} className="auth-card w-full max-w-[440px] gap-[18px]" role="region">
      <div className="auth-heading">
        <H1 id={`${panelId}-title`}>{isSignUp ? "Create your account" : isForgot ? "Reset password" : "Sign in"}</H1>
        <P>
          {isSignUp
            ? "Save your paperwork and access it from any device."
            : isForgot
              ? "Enter your email and we’ll send a link to reset your password."
              : "Welcome back. Sign in to save and sync your history."}
        </P>
      </div>

      <AuthNotice
        icon={isForgot ? <Mail /> : <ShieldCheck />}
        title={isForgot ? "Only for saved accounts" : "An account is optional"}
      >
        {isForgot
          ? "If you never made an account, you can keep using the tools without one."
          : isSignUp
            ? "You can use every tool without signing up. Create an account only to sync history."
            : "Your paperwork stays in your browser. Sign in only to save history across devices."}
      </AuthNotice>

      {feedback ? <AlertBanner variant={feedback.kind}>{feedback.text}</AlertBanner> : null}

      {isForgot ? (
        <form onSubmit={requestRecovery}>
          <FieldSet className="grid min-w-0 gap-[18px] border-0 p-0" disabled={pending}>
            <FieldLegend className="sr-only">Password recovery</FieldLegend>
            <Field htmlFor={`${panelId}-recovery-email`} label="Email" variant="auth">
              <Input
                autoComplete="email"
                id={`${panelId}-recovery-email`}
                name="email"
                placeholder="jane@company.com"
                required
                type="email"
              />
            </Field>
            <Button className="w-full" type="submit">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </FieldSet>
        </form>
      ) : (
        <>
          <Button className="w-full" disabled={pending} onClick={signInWithGoogle} type="button" variant="outline">
            <img alt="" className="size-4 object-contain" height="16" src="/auth/google-g-logo.png" width="16" />
            {isSignUp ? "Sign up with Google" : "Continue with Google"}
          </Button>

          <div className="auth-divider">
            <Separator />
            <Text>or</Text>
            <Separator />
          </div>

          <form method="post" onSubmit={submitCredentials}>
            <FieldSet className="grid min-w-0 gap-[18px] border-0 p-0" disabled={pending}>
              <FieldLegend className="sr-only">
                {isSignUp ? "Create account with email" : "Sign in with email"}
              </FieldLegend>
              {isSignUp ? (
                <Field htmlFor={`${panelId}-name`} label="Full name" variant="auth">
                  <Input
                    autoComplete="name"
                    id={`${panelId}-name`}
                    maxLength={100}
                    name="name"
                    placeholder="Jane Cooper"
                    required
                  />
                </Field>
              ) : null}
              <Field htmlFor={`${panelId}-email`} label="Email" variant="auth">
                <Input
                  autoComplete="email"
                  id={`${panelId}-email`}
                  name="email"
                  placeholder="jane@company.com"
                  required
                  type="email"
                />
              </Field>
              <Field
                description={isSignUp ? "At least 12 characters." : undefined}
                htmlFor={`${panelId}-password`}
                label="Password"
                variant="auth"
              >
                <Input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  id={`${panelId}-password`}
                  maxLength={128}
                  minLength={isSignUp ? 12 : undefined}
                  name="password"
                  placeholder="••••••••••"
                  required
                  type="password"
                />
              </Field>

              {isSignUp ? (
                <Label className="auth-terms-row">
                  <CheckboxControl
                    aria-label="Agree to the Terms of Service and Privacy Policy"
                    checked={termsAccepted}
                    disabled={pending}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  />
                  <Text>
                    I agree to the <TextLink href={`${publicOrigin}/paperwork/terms`}>Terms of Service</TextLink> and{" "}
                    <TextLink href={`${publicOrigin}/privacy`}>Privacy Policy</TextLink>.
                  </Text>
                </Label>
              ) : (
                <div className="auth-options-row">
                  <Label>
                    <CheckboxControl aria-label="Remember me" defaultChecked />
                    <Text>Remember me</Text>
                  </Label>
                  <button onClick={() => chooseMode("forgot")} type="button">
                    <Caption>Forgot password?</Caption>
                  </button>
                </div>
              )}

              <Button className="w-full" type="submit">
                {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </Button>
            </FieldSet>
          </form>
        </>
      )}

      <div className="auth-card-footer-link">
        <Text>{isSignUp ? "Already have an account?" : isForgot ? "Remembered it?" : "New here?"}</Text>
        <button
          disabled={pending}
          onClick={() => chooseMode(isSignUp || isForgot ? "sign-in" : "sign-up")}
          type="button"
        >
          <Caption>{isSignUp ? "Sign in" : isForgot ? "Back to sign in" : "Create an account"}</Caption>
        </button>
      </div>
    </Card>
  );
}
