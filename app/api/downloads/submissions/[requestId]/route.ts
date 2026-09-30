import { handleDownloadRequest } from "@/lib/downloaders/http";

export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  return handleDownloadRequest(request, "submission", await context.params);
}
