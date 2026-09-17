import { toolIconUrl } from "@/lib/tool-framework/icons";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (
    !Array.isArray(path) ||
    path.length < 2 ||
    path.length > 16 ||
    path.some(
      (segment) =>
        typeof segment !== "string" || !/^[\p{L}\p{N} _+.-]+$/u.test(segment) || segment === "." || segment === "..",
    ) ||
    path.join("/").length > 1024 ||
    !/^v[1-9]\d{0,19}$/.test(path[0]) ||
    !path.at(-1)!.endsWith(".png") ||
    path.at(-1)!.length <= 4
  ) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const response = await fetch(
      toolIconUrl(cloudName, { version: path[0].slice(1), publicId: path.slice(1).join("/").slice(0, -4) }),
      {
        headers: { Accept: "image/png" },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok || !response.body || response.headers.get("content-type")?.split(";")[0].trim() !== "image/png") {
      await response.body?.cancel();
      return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
