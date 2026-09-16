import { TOOL_CATEGORIES } from "@/lib/tool-framework/categories";
import { getTools } from "@/lib/tool-framework/catalog";

const RESULT_LIMIT = 6;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!query) return Response.json({ results: [] });

  try {
    const results = (await getTools())
      .filter((tool) =>
        [tool.name, tool.description, TOOL_CATEGORIES[tool.category].label, ...tool.keywords]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, RESULT_LIMIT)
      .map((tool) => ({
        category: TOOL_CATEGORIES[tool.category].label,
        description: tool.description,
        href: tool.href,
        icon: tool.icon,
        name: tool.name,
        toolId: tool.toolId,
      }));

    return Response.json({ results });
  } catch {
    return Response.json({ error: "Unable to search tools" }, { status: 500 });
  }
}
