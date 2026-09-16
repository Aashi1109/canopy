import { SmartToolsFooter } from "@/components/smarttools/SmartToolsFooter";
import { getOptionalSession } from "@smarttools/auth/session";
import { AccountNavigation, AppContainer, Button, Card, ProductHeader, ToolPageHeader } from "@smarttools/ui";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import type { ReactNode } from "react";

export default async function InformationPage({
  children,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  const requestHeaders = await headers();
  const session = await getOptionalSession(requestHeaders);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProductHeader
        actions={<AccountNavigation returnTo="/paperwork" user={session?.user ?? null} />}
        href="/paperwork"
        name="Paperwork"
      />
      <main className="grow py-12 sm:py-16">
        <AppContainer>
          <Button
            asChild
            className="mb-8 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
            variant="ghost"
          >
            <a href="/paperwork">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to Paperwork tools
            </a>
          </Button>
          <ToolPageHeader className="max-w-3xl" description={description} eyebrow={eyebrow} title={title} />
          <Card className="max-w-3xl space-y-7 p-6 sm:p-8">{children}</Card>
        </AppContainer>
      </main>
      <SmartToolsFooter />
    </div>
  );
}
