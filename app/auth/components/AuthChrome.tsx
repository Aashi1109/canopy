import type { ReactNode } from "react";
import { AccountNavigation, ProductHeader } from "@smarttools/ui";
import { SmartToolsFooter } from "@/components/smarttools/SmartToolsFooter";
import type { AuthProjectPaths } from "./AuthDiscoveryNavigation";

export function AuthNavbar() {
  return (
    <ProductHeader
      actions={<AccountNavigation returnTo="/auth" user={null} />}
      className="sticky top-0 z-50"
      href="/"
      name="SmartTools"
    />
  );
}

export function AuthFooter() {
  return <SmartToolsFooter />;
}

export function AuthScreen({ children }: { children: ReactNode; projects?: AuthProjectPaths }) {
  return (
    <div className="auth-shell min-h-screen bg-background text-foreground">
      <AuthNavbar />
      <main className="auth-screen-main">{children}</main>
      <AuthFooter />
    </div>
  );
}
