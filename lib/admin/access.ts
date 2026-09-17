import { getSession } from "@canopy/auth/session";
import { AuthorizationError, requirePermission } from "@canopy/control-plane";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function authEntryUrl(): string {
  return `/auth?${new URLSearchParams({ returnTo: "/admin" })}`;
}

export async function getActorUserId(): Promise<string> {
  const session = await getSession(await headers());
  if (!session) redirect(authEntryUrl());
  return session.user.id;
}

export async function requirePagePermission(resource: string, action: string) {
  const session = await getSession(await headers());
  if (!session) redirect(authEntryUrl());

  try {
    await requirePermission(session.user.id, resource, action);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/admin/denied");
    throw error;
  }

  return session;
}
