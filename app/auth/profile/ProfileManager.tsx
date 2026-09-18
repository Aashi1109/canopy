"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Text,
  Caption,
  List,
  Muted,
  Overline,
  P,
  Strong,
  AlertBanner,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Checkbox,
  DangerZone,
  Field,
  Input,
  SectionHeading,
  SidebarNavItem,
  StatusBadge,
} from "@/components/ui/index.tsx";
import { authClient } from "../_lib/authClient";
import { canConfirmAccountDeletion, getSafeAuthError, isValidPassword, normalizeProfileImage } from "../_lib/security";

type AccountResult = Awaited<ReturnType<typeof authClient.listAccounts>>;
type SessionResult = Awaited<ReturnType<typeof authClient.listSessions>>;
type LinkedAccount = NonNullable<AccountResult["data"]>[number];
type ActiveSession = NonNullable<SessionResult["data"]>[number];
type Feedback = { kind: "error" | "success"; text: string } | null;

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground" role="status">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />
      <Text>{label}</Text>
    </div>
  );
}

type InitialUser = {
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
};

function value(form: FormData, name: string): string {
  const field = form.get(name);
  return typeof field === "string" ? field : "";
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function providerName(providerId: string): string {
  if (providerId === "credential") return "Email and password";
  if (providerId === "google") return "Google";
  return providerId;
}

const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROFILE_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const PROFILE_IMAGE_SIZE = 256;

async function prepareProfileImage(file: File): Promise<string> {
  if (file.size === 0 || file.size > MAX_PROFILE_IMAGE_FILE_SIZE || !PROFILE_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image up to 5 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image could not be read.");
  }

  try {
    const cropSize = Math.min(bitmap.width, bitmap.height);
    if (cropSize === 0) throw new Error("That image could not be read.");

    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_IMAGE_SIZE;
    canvas.height = PROFILE_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That image could not be prepared.");

    context.drawImage(
      bitmap,
      (bitmap.width - cropSize) / 2,
      (bitmap.height - cropSize) / 2,
      cropSize,
      cropSize,
      0,
      0,
      PROFILE_IMAGE_SIZE,
      PROFILE_IMAGE_SIZE,
    );
    const image = normalizeProfileImage(canvas.toDataURL("image/webp", 0.82));
    if (!image) throw new Error("That image could not be prepared.");
    return image;
  } finally {
    bitmap.close();
  }
}

export function ProfileManager({
  initialUser,
  currentSessionId,
}: {
  initialUser: InitialUser;
  currentSessionId: string;
}) {
  const { data: liveSession, refetch } = authClient.useSession();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(true);
  const [pending, setPending] = useState<string>();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [profileImage, setProfileImage] = useState(initialUser.image);

  const user = liveSession?.user ?? initialUser;
  const hasPassword = accounts.some((account) => account.providerId === "credential");
  const googleAccount = accounts.find((account) => account.providerId === "google");
  const avatarInitial = user.name.trim().charAt(0).toUpperCase() || "S";

  const loadSecurityData = useCallback(async () => {
    setLoadingSecurity(true);
    const [accountResult, sessionResult] = await Promise.all([authClient.listAccounts(), authClient.listSessions()]);

    if (accountResult.data) setAccounts(accountResult.data);
    if (sessionResult.data) setSessions(sessionResult.data);
    if (accountResult.error || sessionResult.error) {
      setFeedback({
        kind: "error",
        text: getSafeAuthError(accountResult.error ?? sessionResult.error),
      });
    }
    setLoadingSecurity(false);
  }, []);

  useEffect(() => {
    void loadSecurityData();
  }, [loadSecurityData]);

  async function chooseProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setPending("image");
    setFeedback(null);
    try {
      setProfileImage(await prepareProfileImage(file));
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Choose a valid profile image.",
      });
    }
    setPending(undefined);
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = value(form, "name").trim();
    if (!name || name.length > 100) {
      setFeedback({ kind: "error", text: "Enter a name under 100 characters." });
      return;
    }

    let image: string | null;
    try {
      image = normalizeProfileImage(value(form, "image"));
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Choose a valid profile image.",
      });
      return;
    }

    setPending("profile");
    setFeedback(null);
    const result = await authClient.updateUser({ name, image });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      await refetch();
      setFeedback({ kind: "success", text: "Profile updated." });
    }
    setPending(undefined);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = value(form, "currentPassword");
    const newPassword = value(form, "newPassword");
    const confirmation = value(form, "passwordConfirmation");
    if (!isValidPassword(newPassword)) {
      setFeedback({ kind: "error", text: "Use 12 to 128 characters for your password." });
      return;
    }
    if (newPassword !== confirmation) {
      setFeedback({ kind: "error", text: "Passwords do not match." });
      return;
    }

    setPending("password");
    setFeedback(null);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      formElement.reset();
      await loadSecurityData();
      setFeedback({
        kind: "success",
        text: "Password changed and other sessions revoked.",
      });
    }
    setPending(undefined);
  }

  async function linkGoogle() {
    setPending("google");
    setFeedback(null);
    const result = await authClient.linkSocial({
      provider: "google",
      callbackURL: "/auth/profile",
    });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
      setPending(undefined);
    }
  }

  async function unlinkGoogle() {
    if (!googleAccount || accounts.length < 2) return;
    setPending("google");
    setFeedback(null);
    const result = await authClient.unlinkAccount({
      providerId: googleAccount.providerId,
      accountId: googleAccount.accountId,
    });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      await loadSecurityData();
      setFeedback({ kind: "success", text: "Google account unlinked." });
    }
    setPending(undefined);
  }

  async function revokeSession(session: ActiveSession) {
    setPending(`session:${session.id}`);
    setFeedback(null);
    const result = await authClient.revokeSession({ token: session.token });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      await loadSecurityData();
      setFeedback({ kind: "success", text: "Session revoked." });
    }
    setPending(undefined);
  }

  async function revokeOtherSessions() {
    setPending("other-sessions");
    setFeedback(null);
    const result = await authClient.revokeOtherSessions();
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      await loadSecurityData();
      setFeedback({ kind: "success", text: "Other sessions revoked." });
    }
    setPending(undefined);
  }

  async function signOut() {
    setPending("sign-out");
    const result = await authClient.signOut();
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
      setPending(undefined);
      return;
    }
    window.location.assign("/");
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmation = value(new FormData(event.currentTarget), "confirmation");
    if (!user.emailVerified || !canConfirmAccountDeletion(confirmation, user.email)) {
      setFeedback({
        kind: "error",
        text: "Verify the account and enter its email address exactly.",
      });
      return;
    }

    setPending("delete");
    setFeedback(null);
    const result = await authClient.deleteUser({ callbackURL: "/" });
    if (result.error) {
      setFeedback({ kind: "error", text: getSafeAuthError(result.error) });
    } else {
      setFeedback({
        kind: "success",
        text: "Check your verified email to confirm permanent account deletion.",
      });
    }
    setPending(undefined);
  }

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside aria-labelledby="account-overview-label" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Overline className="block text-primary" id="account-overview-label">
            Account overview
          </Overline>
          <div className="mt-4 flex min-w-0 items-center gap-4 lg:block">
            <Avatar aria-hidden="true" className="size-16 bg-primary ring-4 ring-accent">
              {profileImage ? <AvatarImage alt="" referrerPolicy="no-referrer" src={profileImage} /> : null}
              <AvatarFallback className="bg-primary text-primary-foreground">{avatarInitial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 lg:mt-4">
              <P className="truncate text-foreground">{user.name}</P>
              <Muted className="mt-1 break-all text-muted-foreground">{user.email}</Muted>
            </div>
          </div>

          <nav aria-label="Profile sections" className="mt-6 hidden gap-1 lg:grid">
            {[
              ["Profile", "#profile"],
              ["Sign-in methods", "#sign-in-methods"],
              ["Password", "#password"],
              ["Active sessions", "#active-sessions"],
              ["Delete account", "#delete-account"],
            ].map(([label, href]) => (
              <SidebarNavItem href={href} key={href}>
                {label}
              </SidebarNavItem>
            ))}
          </nav>

          <Button className="mt-6 w-full" disabled={Boolean(pending)} onClick={signOut} type="button" variant="outline">
            {pending === "sign-out" ? "Signing out…" : "Sign out"}
          </Button>
        </aside>

        <div className="min-w-0">
          {feedback ? (
            <AlertBanner className="mb-6" variant={feedback.kind}>
              {feedback.text}
            </AlertBanner>
          ) : null}

          <div className="grid gap-12 sm:gap-14">
            <section className="scroll-mt-24" id="profile">
              <SectionHeading description="Shown anywhere your account appears across SmartTools." title="Profile" />
              <form aria-busy={pending === "profile"} className="grid max-w-2xl gap-5" onSubmit={updateProfile}>
                <Field htmlFor="profile-name" label="Name" variant="auth">
                  <Input defaultValue={user.name} id="profile-name" maxLength={100} name="name" required />
                </Field>
                <input name="image" readOnly type="hidden" value={profileImage ?? ""} />
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
                  <Avatar className="size-16 bg-primary">
                    {profileImage ? (
                      <AvatarImage alt="Profile preview" referrerPolicy="no-referrer" src={profileImage} />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground">{avatarInitial}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <P className="text-foreground">Profile photo</P>
                    <Caption className="block mt-1 text-muted-foreground" id="profile-image-help">
                      Choose a JPG, PNG, or WebP up to 5 MB. It is cropped and compressed in your browser.
                    </Caption>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        aria-describedby="profile-image-help"
                        className="peer sr-only"
                        disabled={Boolean(pending)}
                        id="profile-image"
                        onChange={chooseProfileImage}
                        type="file"
                      />
                      <Button
                        asChild
                        className={`peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
                          pending ? "pointer-events-none opacity-50" : ""
                        }`}
                        size="sm"
                        variant="outline"
                      >
                        <label aria-disabled={Boolean(pending)} className="cursor-pointer" htmlFor="profile-image">
                          {pending === "image" ? "Preparing…" : profileImage ? "Change photo" : "Choose photo"}
                        </label>
                      </Button>
                      {profileImage ? (
                        <Button
                          disabled={Boolean(pending)}
                          onClick={() => setProfileImage(null)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Button className="w-full sm:w-fit" disabled={Boolean(pending)} type="submit">
                  {pending === "profile" ? "Saving…" : "Save profile"}
                </Button>
              </form>
            </section>

            <section className="scroll-mt-24" id="sign-in-methods">
              <SectionHeading description="Ways you can securely access this account." title="Sign-in methods" />
              {loadingSecurity ? (
                <LoadingState label="Loading sign-in methods…" />
              ) : accounts.length > 0 ? (
                <List className="list-none p-0 space-y-0 overflow-hidden rounded-xl border border-border">
                  {accounts.map((account) => (
                    <li
                      className="flex min-w-0 flex-col gap-4 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                      key={account.id}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar aria-hidden="true">
                          <AvatarFallback className="text-accent-foreground">
                            {account.providerId === "google" ? "G" : "@"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid min-w-0 gap-1">
                          <Strong className="break-words">{providerName(account.providerId)}</Strong>
                          <Caption className="text-muted-foreground">Connected {formatDate(account.createdAt)}</Caption>
                        </div>
                      </div>
                      {account.providerId === "google" && accounts.length > 1 ? (
                        <Button
                          disabled={Boolean(pending)}
                          onClick={unlinkGoogle}
                          size="sm"
                          type="button"
                          variant="danger-subtle"
                        >
                          Unlink
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </List>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <Muted className="text-muted-foreground">Sign-in methods could not be loaded.</Muted>
                  <Button onClick={() => void loadSecurityData()} size="sm" type="button" variant="outline">
                    Try again
                  </Button>
                </div>
              )}
              {!loadingSecurity && accounts.length > 0 && !googleAccount ? (
                <Button
                  className="mt-4 w-full sm:w-fit"
                  disabled={Boolean(pending)}
                  onClick={linkGoogle}
                  type="button"
                  variant="outline"
                >
                  {pending === "google" ? "Connecting…" : "Link Google account"}
                </Button>
              ) : null}
              {googleAccount && accounts.length === 1 ? (
                <Caption className="block mt-4 text-muted-foreground">
                  Add another sign-in method before unlinking your only identity.
                </Caption>
              ) : null}
            </section>

            <section className="scroll-mt-24" id="password">
              <SectionHeading description="Changing your password signs out your other devices." title="Password" />
              {loadingSecurity ? (
                <LoadingState label="Checking password access…" />
              ) : accounts.length === 0 ? (
                <Muted className="text-muted-foreground">
                  Password settings are unavailable until sign-in methods load.
                </Muted>
              ) : hasPassword ? (
                <form aria-busy={pending === "password"} className="grid max-w-2xl gap-5" onSubmit={changePassword}>
                  <Field htmlFor="current-password" label="Current password" variant="auth">
                    <Input
                      autoComplete="current-password"
                      id="current-password"
                      name="currentPassword"
                      required
                      type="password"
                    />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      description="12–128 characters"
                      htmlFor="profile-new-password"
                      label="New password"
                      variant="auth"
                    >
                      <Input
                        autoComplete="new-password"
                        id="profile-new-password"
                        maxLength={128}
                        minLength={12}
                        name="newPassword"
                        required
                        type="password"
                      />
                    </Field>
                    <Field htmlFor="profile-confirm-password" label="Confirm new password" variant="auth">
                      <Input
                        autoComplete="new-password"
                        id="profile-confirm-password"
                        maxLength={128}
                        minLength={12}
                        name="passwordConfirmation"
                        required
                        type="password"
                      />
                    </Field>
                  </div>
                  <Button className="w-full sm:w-fit" disabled={Boolean(pending)} type="submit">
                    {pending === "password" ? "Updating…" : "Change password"}
                  </Button>
                </form>
              ) : (
                <Muted className="text-muted-foreground">This account currently signs in through Google.</Muted>
              )}
            </section>

            <section className="scroll-mt-24" id="active-sessions">
              <SectionHeading
                action={
                  sessions.length > 1 ? (
                    <Button
                      disabled={Boolean(pending)}
                      onClick={revokeOtherSessions}
                      size="sm"
                      type="button"
                      variant="danger-subtle"
                    >
                      Revoke others
                    </Button>
                  ) : undefined
                }
                description="Devices and browsers currently signed in."
                title="Active sessions"
              />
              {loadingSecurity ? (
                <LoadingState label="Loading sessions…" />
              ) : sessions.length > 0 ? (
                <List className="list-none p-0 space-y-0 overflow-hidden rounded-xl border border-border">
                  {sessions.map((session) => {
                    const isCurrent = session.id === currentSessionId;
                    return (
                      <li
                        className="flex min-w-0 flex-col gap-4 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
                        key={session.id}
                      >
                        <div className="grid min-w-0 gap-1">
                          <Strong className="break-words">
                            {isCurrent ? "This device" : session.userAgent || "Unknown device"}
                          </Strong>
                          <Caption className="break-words text-muted-foreground">
                            {session.ipAddress || "IP unavailable"} · Started {formatDate(session.createdAt)}
                          </Caption>
                        </div>
                        {isCurrent ? (
                          <StatusBadge variant="success">Current</StatusBadge>
                        ) : (
                          <Button
                            disabled={Boolean(pending)}
                            onClick={() => revokeSession(session)}
                            size="sm"
                            type="button"
                            variant="danger-subtle"
                          >
                            {pending === `session:${session.id}` ? "Revoking…" : "Revoke"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </List>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
                  <Muted className="text-muted-foreground">Active sessions could not be loaded.</Muted>
                  <Button onClick={() => void loadSecurityData()} size="sm" type="button" variant="outline">
                    Try again
                  </Button>
                </div>
              )}
            </section>
          </div>

          <DangerZone aria-labelledby="delete-account-heading" className="mt-10 space-y-6" id="delete-account">
            <SectionHeading
              description="Permanently remove your account after email confirmation."
              title="Delete account"
            />
            {!user.emailVerified ? (
              <AlertBanner title="Verify your email first" variant="warning">
                Account deletion stays locked until your email address is verified.
              </AlertBanner>
            ) : null}
            <form aria-busy={pending === "delete"} className="grid gap-4" onSubmit={requestDeletion}>
              <Field
                description={`Type ${user.email} exactly.`}
                htmlFor="delete-confirmation"
                label="Confirm your email address"
                variant="auth"
              >
                <Input autoComplete="off" id="delete-confirmation" name="confirmation" required type="email" />
              </Field>
              <Checkbox label="I understand that account deletion cannot be undone." name="understood" required />
              <Button
                className="w-full sm:w-fit"
                disabled={Boolean(pending) || !user.emailVerified}
                type="submit"
                variant="destructive"
              >
                {pending === "delete" ? "Sending confirmation…" : "Send deletion email"}
              </Button>
            </form>
          </DangerZone>
        </div>
      </div>
    </>
  );
}
