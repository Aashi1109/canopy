import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getOptionalSession } from "@/lib/auth/session";
import ToolPage from "@/components/ToolPage";
import { relatedTools, resolveToolPage } from "@/lib/tool-framework/catalog";
import { toolMetadata } from "@/lib/tool-framework/metadata";

export const generateMetadata = toolMetadata("downloaders");

export default async function DownloaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await resolveToolPage("downloaders", slug);
  if (!tool) notFound();
  const [related, session] = await Promise.all([relatedTools(tool.toolId), getOptionalSession(await headers())]);
  return (
    <ToolPage
      account={{ returnTo: tool.href, user: session?.user ?? null }}
      category="Downloaders"
      definitionKey={tool.definitionKey}
      description={tool.description}
      icon={tool.icon}
      relatedTools={related
        .filter((item) => item.app === "downloaders")
        .map((item) => ({ href: item.href, label: item.name }))}
      spec={tool.spec}
      title={tool.name}
    />
  );
}
