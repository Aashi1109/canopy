import { getPublicTools } from "@/lib/tool-framework/catalog";
import { searchTools } from "@/lib/tool-catalog/index";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!query) return Response.json({ results: [] });

  try {
    const results = searchTools(await getPublicTools(), query).map((tool) => ({
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
