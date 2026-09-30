import { handleDownloadRequest } from "@/lib/downloaders/http";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return handleDownloadRequest(request, "select", await context.params);
}
