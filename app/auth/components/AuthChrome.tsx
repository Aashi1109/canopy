import type { ReactNode } from "react";
import { AccountNavigation, ProductHeader, Toaster } from "@canopy/ui";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import type { AuthProjectPaths } from "./AuthDiscoveryNavigation";

export function AuthNavbar() {
  return (
    <ProductHeader
      account={{ returnTo: "/auth", user: null }}
      actions={<AccountNavigation returnTo="/auth" user={null} />}
      className="sticky top-0 z-50"
      href="/"
      name="SmartTools"
    />
  );
}

export function AuthFooter() {
  return <CanopyFooter />;
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
