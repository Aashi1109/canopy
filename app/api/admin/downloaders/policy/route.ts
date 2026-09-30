import { handleDownloadRequest } from "@/lib/downloaders/http";

export function GET(request: Request) {
  return handleDownloadRequest(request, "policy");
}
export function PUT(request: Request) {
  return handleDownloadRequest(request, "policy");
}
