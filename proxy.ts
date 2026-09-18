import { auth } from "./lib/auth/index.ts";
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "./utils/errorMessage.ts";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Logout must remain available even when session lookup is unavailable.
  if (pathname === "/api/auth/sign-out" && request.method === "POST") {
    return NextResponse.next();
  }
  if (!getSessionCookie(request, { cookiePrefix: "smarttools" })) {
    return NextResponse.next();
  }

  let session;
  try {
    session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error, "Unable to check account access. Please try again.") },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!session || session.user.status === "active") return NextResponse.next();

  const reading = request.method === "GET" || request.method === "HEAD";
  if (reading && (pathname === "/account/suspended" || pathname === "/api/auth/get-session")) {
    return NextResponse.next();
  }
  if (!reading || pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        code: "ACCOUNT_SUSPENDED",
        error: "Your account is suspended.",
        redirectTo: "/account/suspended",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.redirect(new URL("/account/suspended", request.url), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image(?:/|$)|tool-icons/|favicon\\.ico$).*)"],
};
