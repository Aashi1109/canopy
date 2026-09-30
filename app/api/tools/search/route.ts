import { getPublicTools } from "@/lib/tool-framework/catalog";
import { searchTools } from "@/lib/tool-catalog/index";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

// Curated discovery order; names, URLs and availability still come from the public catalog.
const SUGGESTED_TOOL_IDS = [
  "devtools.json-formatter",
  "media.merge-pdf",
  "paperwork.invoice-generator",
  "devtools.qr-code-generator",
  "devtools.json-editor",
  "media.resize-image",
  "media.compress-image",
  "paperwork.receipt-generator",
  "paperwork.expense-report",
  "media.youtube-video-downloader",
  "media.instagram-video-downloader",
  "media.tiktok-video-downloader",
];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().toLowerCase() ?? "";
  const family = params.get("family");

  if (family !== null && !["paperwork", "devtools", "media", "downloaders"].includes(family)) {
    return Response.json({ error: "Invalid tool family" }, { status: 400 });
  }

  if (!query && params.get("suggestions") !== "1") return Response.json({ results: [] });

  try {
    const tools = await getPublicTools();
    const matchingTools = family === null ? tools : tools.filter((tool) => tool.app === family);
    let selectedTools = query
      ? searchTools(matchingTools, query)
      : [
          ...SUGGESTED_TOOL_IDS.flatMap((toolId) => matchingTools.filter((tool) => tool.toolId === toolId)),
          ...matchingTools.filter((tool) => !SUGGESTED_TOOL_IDS.includes(tool.toolId)),
        ];
    if (!query) {
      selectedTools = family
        ? selectedTools.slice(0, 3)
        : selectedTools.filter(
            (tool, index, ordered) => ordered.findIndex((entry) => entry.app === tool.app) === index,
          );
    }
    const results = selectedTools.map((tool) => ({
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
