"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ContentState } from "@/components/ui/index.tsx";

/** The short-lived ticket stays in the fragment, outside request URLs and referrers. */
async function completeLocalSignIn(): Promise<string> {
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, "", window.location.pathname);
  const token = params.get("token");
  const state = params.get("state");
  const returnTo = params.get("returnTo");
  if (!token || !state || !returnTo) throw new Error("Missing sign-in details");

  const response = await fetch("/api/auth/local-session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, state, returnTo }),
  });
  if (!response.ok) throw new Error("Sign-in could not be completed");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("redirectTo" in result) || typeof result.redirectTo !== "string") {
    throw new Error("Invalid sign-in destination");
  }
  const destination = new URL(result.redirectTo, window.location.origin);
  if (destination.origin !== window.location.origin) throw new Error("Invalid sign-in destination");
  return destination.href;
}

export default function LocalSessionPage() {
  const [failed, setFailed] = useState(false);
  const completion = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let active = true;
    // React's development effect replay must not consume the same ticket twice.
    completion.current ??= completeLocalSignIn();
    completion.current.then(
      (destination) => {
        if (active) window.location.replace(destination);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-muted p-6">
      <ContentState
        density="page"
        headingLevel="h1"
        state={failed ? "error" : "loading"}
        title={failed ? "We couldn’t finish signing you in" : "Finishing sign-in…"}
        description={failed ? "Please return to sign in and try again." : "You’ll be taken to your workspace shortly."}
        action={
          failed ? (
            <Button asChild>
              <a href="/auth?localChecked=1">Back to sign in</a>
            </Button>
          ) : undefined
        }
      />
    </main>
  );
}
