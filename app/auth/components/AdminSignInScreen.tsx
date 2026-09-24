"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, ContentState, ProductHeader, Toaster, toast } from "@/components/ui/index.tsx";
import { authClient } from "../_lib/authClient";
import { getSafeAuthError } from "../_lib/security";

export function AdminSignInScreen({
  returnTo,
  publicSiteUrl,
  initialError,
  googleSignInUrl,
}: {
  returnTo: string;
  publicSiteUrl: string;
  initialError?: string;
  googleSignInUrl?: string;
}) {
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const displayedError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!initialError || displayedError.current === initialError) return;
    displayedError.current = initialError;
    toast.error(initialError, { id: "admin-sign-in-error" });
  }, [initialError]);

  async function signInWithGoogle() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    toast.dismiss("admin-sign-in-error");
    try {
      if (googleSignInUrl) {
        window.location.assign(googleSignInUrl);
        return;
      }
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnTo,
        errorCallbackURL: `/auth?${new URLSearchParams({ returnTo })}`,
      });
      if (!result.error) return;
      toast.error(getSafeAuthError(result.error), { id: "admin-sign-in-error" });
    } catch (error) {
      toast.error(getSafeAuthError(error), { id: "admin-sign-in-error" });
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted text-foreground">
      <ProductHeader
        compact
        minimal
        className="static h-[72px] shrink-0 [&>div]:h-full [&>div]:min-h-0 [&>div]:max-w-none [&>div]:px-4 sm:[&>div]:px-10 [&>div>a]:gap-[13px] [&>div>a>img]:size-[42px] [&>div>a_strong]:text-[21px] [&>div>a_strong]:font-[750] [&>div>a_[data-slot=typography-caption]]:text-xs"
        href={publicSiteUrl}
        publicSiteUrl={publicSiteUrl}
        name="SmartTools"
        subtitle="Administration"
        actions={
          <Button asChild size="md" variant="ghost">
            <a href={publicSiteUrl} aria-label="Back to SmartTools">
              <ArrowLeft aria-hidden="true" />
              <span className="hidden compact:inline">Back to SmartTools</span>
              <span className="compact:hidden">Back</span>
            </a>
          </Button>
        }
      />
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-10">
        <div className="flex w-full max-w-[520px] flex-col gap-6">
          <Card className="gap-7 p-6 shadow-none sm:p-10">
            <ContentState
              className="flex-none p-0 [&_[data-slot=empty-header]]:gap-4 [&_[data-slot=empty-icon]]:rounded-xl [&_[data-slot=empty-icon]]:bg-accent [&_[data-slot=empty-icon]]:text-primary [&_h1]:text-[26px] [&_[data-slot=empty-description]]:text-base [&_[data-slot=empty-description]]:leading-6"
              headingLevel="h1"
              icon={<ShieldCheck aria-hidden="true" />}
              title="Sign in to SmartTools Admin"
              description={
                <>
                  Manage tools, content, and team access.
                  <br />
                  Use your Google account to continue.
                </>
              }
            />
            <Button
              className="w-full"
              size="md"
              variant="outline"
              loading={pending}
              onClick={() => void signInWithGoogle()}
            >
              {!pending && (
                <img
                  alt=""
                  className="size-[18px] object-contain"
                  height={18}
                  src="/auth/google-g-logo.png"
                  width={18}
                />
              )}
              <span aria-live="polite">{pending ? "Connecting to Google…" : "Sign in with Google"}</span>
            </Button>
          </Card>
          <p className="text-center text-sm leading-[1.5] text-muted-foreground">
            Admin access is required. Need permission?
            <br />
            Contact your workspace administrator.
          </p>
        </div>
      </main>
      <footer className="flex min-h-16 shrink-0 flex-col items-center justify-center gap-1 px-4 py-4 text-center text-[13px] leading-5 text-muted-foreground sm:flex-row sm:justify-between sm:px-10 sm:text-left">
        <p>SmartTools · Admin workspace</p>
        <p>Authorized team members only</p>
      </footer>
      <Toaster closeButton position="top-right" />
    </div>
  );
}
