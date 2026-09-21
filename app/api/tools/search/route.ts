import { getPublicTools } from "@/lib/tool-framework/catalog";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

const RESULT_LIMIT = 6;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!query) return Response.json({ results: [] });

  try {
    const results = (await getPublicTools())
      .filter((tool) =>
        [tool.name, tool.description, tool.category, ...tool.keywords].join(" ").toLowerCase().includes(query),
      )
      .slice(0, RESULT_LIMIT)
      .map((tool) => ({
        category: tool.category,
        description: tool.description,
        href: tool.href,
        icon: tool.icon,
        name: tool.name,
        toolId: tool.toolId,
      }));

    return Response.json({ results });
  } catch (error) {
    captureException(error);
    return Response.json({ error: errorMessage(error, "Unable to search tools") }, { status: 500 });
  }
}
