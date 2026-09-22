import type { ReactNode } from "react";
import { AccountNavigation, ProductHeader, Toaster } from "@/components/ui/index.tsx";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import config from "@/lib/config/config.ts";
import type { AuthProjectPaths } from "./AuthDiscoveryNavigation";

export function AuthNavbar() {
  return (
    <ProductHeader
      account={{ publicSiteUrl: config.appUrl, returnTo: "/auth", showSignIn: false, user: null }}
      actions={<AccountNavigation publicSiteUrl={config.appUrl} returnTo="/auth" showSignIn={false} user={null} />}
      className="sticky top-0 z-50"
      href={config.appUrl}
      name="SmartTools"
    />
  );
}

export function AuthFooter() {
  return <CanopyFooter publicOrigin={config.appUrl} />;
}

export function AuthScreen({ children }: { children: ReactNode; projects?: AuthProjectPaths }) {
  return (
    <div className="auth-shell min-h-screen bg-background text-foreground">
      <AuthNavbar />
      <main className="auth-screen-main">{children}</main>
      <AuthFooter />
      <Toaster closeButton position="top-right" theme="dark" />
    </div>
  );
}
