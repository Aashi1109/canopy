import { getSession } from "../auth/session.ts";
import { AuthorizationError, requirePermission } from "./index.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { subdomainHref } from "../routing/subdomains.ts";

function authEntryUrl(): string {
  return `${subdomainHref("admin", "/auth")}?${new URLSearchParams({ returnTo: subdomainHref("admin") })}`;
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
    if (error instanceof AuthorizationError) redirect(subdomainHref("admin", "/denied"));
    throw error;
  }

  return session;
}
