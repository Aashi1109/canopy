import { handleDownloadRequest } from "@/lib/downloaders/http";

export async function POST(request: Request) {
  return handleDownloadRequest(request, "create");
}
