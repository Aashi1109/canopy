import { getSession } from "@/lib/auth/session.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/account/AccessDeniedScreen";

export default async function DeniedPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/auth?returnTo=%2Fadmin");
  return <AccessDeniedScreen user={session.user} />;
}
