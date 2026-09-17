import { getSession } from "@canopy/auth/session";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/account/AccessDeniedScreen";

export const metadata: Metadata = {
  title: "Account suspended | SmartTools",
  robots: { index: false, follow: false },
};

export default async function SuspendedPage({ searchParams }: { searchParams: Promise<{ checked?: string }> }) {
  const session = await getSession(await headers());
  if (!session) redirect("/auth");
  if (session.user.status !== "suspended") redirect("/");
  const { checked } = await searchParams;
  return <AccessDeniedScreen suspended checked={checked === "1"} user={session.user} />;
}
