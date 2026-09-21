import { TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { getPublicTools } from "@/lib/tool-framework/catalog";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

const ECOSYSTEMS = [
  { app: "paperwork", href: "/paperwork", id: "documents", label: "Documents" },
  { app: "devtools", href: "/devtools", id: "developer", label: "Developer" },
  { app: "media", href: "/media", id: "media", label: "Media" },
] as const;

export async function GET() {
  try {
    const tools = await getPublicTools();
    const groups = ECOSYSTEMS.map((ecosystem) => {
      const matchingTools = tools.filter((tool) => tool.app === ecosystem.app);
      const previews = matchingTools.map(({ href, icon, name, toolId }) => ({ href, icon, name, toolId }));
      return {
        ...ecosystem,
        categories: Object.entries(TOOL_CATEGORIES)
          .filter(([, category]) => category.app === ecosystem.app)
          .map(([key, category]) => ({
            count: matchingTools.filter((tool) => tool.categoryKey === key).length,
            href: `${ecosystem.href}?category=${encodeURIComponent(key)}`,
            label: category.label,
          })),
        count: matchingTools.length,
        tools: ecosystem.app === "paperwork" ? previews : previews.slice(0, 4),
      };
    });
    return Response.json({ groups });
  } catch (error) {
    captureException(error);
    return Response.json({ error: errorMessage(error, "Unable to load tool categories") }, { status: 500 });
  }
}
