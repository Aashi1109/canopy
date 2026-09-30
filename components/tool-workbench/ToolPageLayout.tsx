import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowUpRight, Globe2, ListChecks, LockKeyhole } from "lucide-react";
import { CanopyFooter } from "@/components/canopy/CanopyFooter";
import { AccountNavigation, Badge, Button, H2, List, Muted, Overline, ToolPageShell } from "@/components/ui/index.tsx";
import { resolveCategoryKey, type ToolApp } from "@/lib/tool-framework/categories";
import type { ToolContent } from "@/lib/tool-framework/spec";
import type { ToolPageComponentProps } from "@/lib/tool-runtime/types";

type Props = Omit<ToolPageComponentProps, "definitionKey"> & {
  app: ToolApp;
  content: ToolContent;
  usesNetwork: boolean;
  primaryAction?: string;
  children: ReactNode;
};

/** Shared page chrome; only the workspace and tool-specific content vary. */
export function ToolPageLayout({
  account,
  app,
  category,
  content,
  description,
  relatedTools = [],
  title,
  usesNetwork,
  primaryAction,
  children,
}: Props) {
  const isMedia = app === "media";
  const isDownloader = app === "downloaders";
  const productHref = `/${app}`;
  const productName = isDownloader ? "Downloaders" : isMedia ? "Media tools" : "Developer tools";
  const privacyBadge = usesNetwork ? "USES ONLINE SERVICE" : isMedia ? "PRIVATE FILE PROCESSING" : "PRIVATE IN BROWSER";
  const PrivacyIcon = usesNetwork ? Globe2 : LockKeyhole;
  const capabilityBadge = primaryAction?.toUpperCase() ?? (isMedia ? "FILE TOOL" : "BROWSER TOOL");
  const supportItems = [
    ...(content.limitations?.length
      ? [{ icon: AlertTriangle, eyebrow: "Limitations", items: content.limitations }]
      : []),
    ...(content.howToUse?.length ? [{ icon: ListChecks, eyebrow: "How to use", items: content.howToUse }] : []),
  ];
  return (
    <ToolPageShell
      badge={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge className="border-0 bg-accent text-primary" variant="secondary">
            {capabilityBadge}
          </Badge>
          <Badge className="border-0 bg-accent text-primary" variant="secondary">
            <PrivacyIcon aria-hidden="true" className="size-3" />
            {privacyBadge}
          </Badge>
        </div>
      }
      breadcrumbCurrent={title}
      category={category}
      categoryHref={
        isDownloader ? productHref : `${productHref}?category=${encodeURIComponent(resolveCategoryKey(category, app))}`
      }
      description={description}
      eyebrow={isDownloader ? "VIDEO DOWNLOADER" : isMedia ? "MEDIA TOOL" : "DEVELOPER TOOL"}
      footer={<CanopyFooter />}
      account={account}
      headerActions={<AccountNavigation {...account} />}
      productHref={productHref}
      productName={productName}
      skipHref="#tool-workspace"
      skipLabel="Skip to tool workspace"
      showCategoryInBreadcrumb
      title={title}
      workspaceClassName="pb-4"
      workspaceId="tool-page-content"
    >
      {children}
      <section
        aria-labelledby="before-you-continue-heading"
        className="mt-4 border-t border-border pt-4"
        data-testid="tool-support"
      >
        <Overline className="text-primary" id="before-you-continue-heading">
          Before you continue
        </Overline>
        <div
          className={`mt-3 grid gap-3 max-[52rem]:grid-cols-1 ${supportItems.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {supportItems.map((item) => {
            const Icon = item.icon;
            return (
              <article className="rounded-lg border border-border bg-muted/55 px-4 py-3" key={item.eyebrow}>
                <Overline className="flex items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className={`size-4 ${item.eyebrow === "Limitations" ? "text-amber-700" : "text-primary"}`}
                  />
                  {item.eyebrow}
                </Overline>
                <List className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                  {item.items.map((text, index) => (
                    <li key={`${item.eyebrow}-${index}`}>{text}</li>
                  ))}
                </List>
              </article>
            );
          })}
        </div>
        <div className="mt-4 flex min-h-20 items-center justify-between gap-6 py-3 max-[52rem]:items-start max-[52rem]:flex-col">
          <div>
            <Overline className="flex items-center gap-2">
              <ArrowLeftRight aria-hidden="true" className="size-4 text-primary" />
              Related tools
            </Overline>
            <H2 className="mt-1">Continue with a related tool</H2>
            <Muted className="mt-1 text-muted-foreground">
              Continue with a focused tool that matches your next step.
            </Muted>
          </div>
          <nav
            aria-label={`Related ${category} tools`}
            className="flex shrink-0 flex-wrap justify-end gap-2 max-[52rem]:justify-start"
          >
            {relatedTools.map((tool) => (
              <Button className="h-9 rounded-lg" asChild key={tool.href} size="sm" variant="outline">
                <a href={tool.href}>
                  {tool.label}
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            ))}
          </nav>
        </div>
      </section>
    </ToolPageShell>
  );
}
