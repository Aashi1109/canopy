import { TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { getTools } from "@/lib/tool-framework/catalog";
import { resolveIcon } from "@/lib/tool-framework/icons";
import { getToolManifest } from "@/lib/tool-framework/manifest";
import { getAvailableTools } from "@smarttools/control-plane";
import { getToolIcons } from "@smarttools/database";
import { errorMessage } from "@/utils/errorMessage";

const ECOSYSTEMS = [
  { app: "paperwork", href: "/paperwork", id: "documents", label: "Documents" },
  { app: "devtools", href: "/devtools", id: "developer", label: "Developer" },
  { app: "media", href: "/media", id: "media", label: "Media" },
] as const;

export async function GET() {
  try {
    const manifest = await getToolManifest();
    const [tools, paperworkTools, iconRows] = await Promise.all([
      getTools(),
      getAvailableTools("paperwork", manifest),
      getToolIcons(),
    ]);
    const iconsByToolId = new Map(Object.entries(iconRows));
    const groups = ECOSYSTEMS.map((ecosystem) => {
      const matchingTools = tools.filter((tool) => tool.app === ecosystem.app);
      const documentTools =
        ecosystem.app === "paperwork"
          ? paperworkTools
              .filter((tool) => tool.slug)
              .map((tool) => ({
                href: `/paperwork/${tool.slug}`,
                icon: resolveIcon(tool.toolId, tool.name, iconsByToolId.get(tool.toolId) ?? null),
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

    return Response.json({ groups });
  } catch (error) {
    return Response.json({ error: errorMessage(error, "Unable to load tool categories") }, { status: 500 });
  }
}
