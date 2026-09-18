import { TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { getTools } from "@/lib/tool-framework/catalog";
import { resolveIcon } from "@/lib/tool-framework/icons";
import { getToolManifest } from "@/lib/tool-framework/manifest";
import { getAvailableTools } from "@canopy/control-plane";
import { Cache, CACHE_NAMESPACES } from "@canopy/cache";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

const ECOSYSTEMS = [
  { app: "paperwork", href: "/paperwork", id: "documents", label: "Documents" },
  { app: "devtools", href: "/devtools", id: "developer", label: "Developer" },
  { app: "media", href: "/media", id: "media", label: "Media" },
] as const;

export async function GET() {
  try {
    const data = await new Cache(CACHE_NAMESPACES.ECOSYSTEM).remember(
      "all",
      async () => {
        const manifest = await getToolManifest();
        const [tools, paperworkTools] = await Promise.all([getTools(), getAvailableTools("paperwork", manifest)]);
        const groups = ECOSYSTEMS.map((ecosystem) => {
          const matchingTools = tools.filter((tool) => tool.app === ecosystem.app);
          const documentTools =
            ecosystem.app === "paperwork"
              ? paperworkTools
                  .filter((tool) => tool.slug)
                  .map((tool) => ({
                    href: `/paperwork/${tool.slug}`,
                    icon: resolveIcon(tool.toolId, tool.name, tool.iconUrl),
                    name: tool.name,
                    toolId: tool.toolId,
                  }))
              : [];
          const previews =
            ecosystem.app === "paperwork"
              ? documentTools
              : matchingTools.map((tool) => ({
                  href: tool.href,
                  icon: tool.icon,
                  name: tool.name,
                  toolId: tool.toolId,
                }));
          return {
            ...ecosystem,
            categories: Object.entries(TOOL_CATEGORIES)
              .filter(([, category]) => category.app === ecosystem.app)
              .map(([key, category]) => ({
                count: matchingTools.filter((tool) => tool.category === key).length,
                href: `${ecosystem.href}?category=${encodeURIComponent(key)}`,
                label: category.label,
              })),
            count: previews.length,
            tools: ecosystem.app === "paperwork" ? previews : previews.slice(0, 4),
          };
        });

        return { groups };
      },
      300,
    );
    return Response.json(data);
  } catch (error) {
    captureException(error);
    return Response.json({ error: errorMessage(error, "Unable to load tool categories") }, { status: 500 });
  }
}
