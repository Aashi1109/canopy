import { getSession } from "@/lib/auth/session.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/account/AccessDeniedScreen";
import { subdomainHref } from "@/lib/routing/subdomains.ts";

export default async function DeniedPage() {
  const session = await getSession(await headers());
  if (!session) redirect(`/auth?${new URLSearchParams({ returnTo: subdomainHref("admin") })}`);
  return <AccessDeniedScreen user={session.user} />;
}
