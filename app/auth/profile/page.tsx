import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { auth } from "@canopy/auth";
import { isAdminUser } from "@canopy/auth/session";
import { H1, Muted, Overline, AccountNavigation, AppContainer, ProductHeader, StatusBadge } from "@canopy/ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveConfiguredReturnTo } from "../_lib/returnTo";
import { ProfileBackLink } from "./components/ProfileBackLink";
import { ProfileManager } from "./ProfileManager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = resolveConfiguredReturnTo(first(params.returnTo));
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const profileReturnTo = new URLSearchParams({ returnTo });
    redirect(`/auth?${new URLSearchParams({ returnTo: `/auth/profile?${profileReturnTo}` })}`);
  }

  const isAdmin = await isAdminUser(session.user.id);

  return (
    <div className="auth-shell min-h-screen bg-background text-foreground">
      <ProductHeader
        account={{ returnTo, user: { name: session.user.name, isAdmin } }}
        actions={<AccountNavigation returnTo={returnTo} user={{ name: session.user.name, isAdmin }} />}
        className="auth-header sticky top-0 z-50"
        href="/"
        name="SmartTools"
      />
      <AppContainer className="pb-16 sm:pb-20">
        <header className="mb-10 border-b border-border pb-8 pt-8 sm:pt-10">
          <div className="-ml-3">
            <ProfileBackLink fallbackHref={returnTo} />
          </div>
          <Overline className="block mt-6 text-primary">Account settings</Overline>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <H1 className="text-foreground">Your SmartTools account</H1>
            <StatusBadge variant={session.user.emailVerified ? "success" : "warning"}>
              {session.user.emailVerified ? "Verified account" : "Verification pending"}
            </StatusBadge>
          </div>
          <Muted className="mt-2 max-w-2xl text-muted-foreground">
            Update your profile, sign-in methods, and account security.
          </Muted>
        </header>
        <ProfileManager
          currentSessionId={session.session.id}
          initialUser={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            emailVerified: session.user.emailVerified,
          }}
        />
      </AppContainer>
      <CanopyFooter />
    </div>
  );
}
