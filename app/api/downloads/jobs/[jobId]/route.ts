import { handleDownloadRequest } from "@/lib/downloaders/http";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return handleDownloadRequest(request, "status", await context.params);
}
