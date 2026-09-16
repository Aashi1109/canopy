import { getOptionalSession } from "@smarttools/auth/session";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import ToolPage from "@/components/ToolPage";
import { relatedTools, resolveToolPage } from "@/lib/tool-framework/catalog";
import { TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { toolMetadata } from "@/lib/tool-framework/metadata";

// Deliberately no `generateStaticParams`: slugs and enablement live in
// `managed_tools` and an admin toggles them at runtime, so prerendering would
// need a redeploy per admin change.
export const generateMetadata = toolMetadata("devtools");

export default async function DevtoolsToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await resolveToolPage("devtools", slug);
  if (!tool) notFound();

  const [related, session] = await Promise.all([relatedTools(tool.toolId), getOptionalSession(await headers())]);

  return (
    <ToolPage
      account={{
        returnTo: tool.href,
        user: session?.user ?? null,
      }}
      category={TOOL_CATEGORIES[tool.category].label}
      definitionKey={tool.definitionKey}
      description={tool.description}
      icon={tool.icon}
      relatedTools={related.map((candidate) => ({
        href: candidate.href,
        label: candidate.name,
      }))}
      spec={tool.spec}
      title={tool.name}
    />
  );
}
