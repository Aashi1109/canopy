import { handleDownloadRequest } from "@/lib/downloaders/http";

export async function GET(request: Request, context: { params: Promise<{ jobId: string; artifactId: string }> }) {
  return handleDownloadRequest(request, "artifact", await context.params);
}
