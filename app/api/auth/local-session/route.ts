import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.ts";
import { usesLocalSubdomainSessions } from "@/lib/auth/localSession.ts";
import config from "@/lib/config/config.ts";
import { getSubdomainForHost } from "@/lib/routing/subdomains.ts";

const HANDOFF_PATH = "/api/auth/local-session";
const STATE_PATTERN = /^[a-f0-9]{64}$/;
const RESPONSE_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function failure(status = 400): NextResponse {
  return NextResponse.json(
    { error: "Unable to continue sign-in. Return to sign-in and try again." },
    {
      status,
      headers: RESPONSE_HEADERS,
    },
  );
}

function redirect(destination: URL): NextResponse {
  return NextResponse.redirect(destination, { status: 303, headers: RESPONSE_HEADERS });
}

function nonceCookie() {
  return `${config.auth.cookiePrefix}.local_auth_state`;
}

function setNonce(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(nonceCookie(), value, {
    httpOnly: true,
    secure: new URL(config.appUrl).protocol === "https:",
    sameSite: "lax",
    path: HANDOFF_PATH,
    maxAge,
  });
}

function destinationUrl(value: unknown, origin: string): URL | null {
  if (typeof value !== "string" || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const destination = new URL(value, origin);
    const path = decodeURIComponent(destination.pathname).replace(/\/+/g, "/");
    if (
      destination.origin !== origin ||
      destination.username ||
      destination.password ||
      /[\\\u0000-\u0020]/.test(path) ||
      /^\/(?:auth|api)(?:\/|$)/.test(path)
    )
      return null;
    return destination;
  } catch {
    return null;
  }
}

function signInUrl(destination: URL, error = false): URL {
  const url = new URL("/auth", destination.origin);
  url.search = new URLSearchParams({
    returnTo: destination.href,
    localChecked: "1",
    ...(error ? { error: "local_session" } : {}),
  }).toString();
  return url;
}

function copyCookies(source: Response, target: NextResponse) {
  for (const cookie of source.headers.getSetCookie()) target.headers.append("Set-Cookie", cookie);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!usesLocalSubdomainSessions()) return failure(404);
  const parent = new URL(config.appUrl);
  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  const subdomain = getSubdomainForHost(host);
  const { searchParams } = request.nextUrl;
  const step = searchParams.get("step");
  const mode = searchParams.get("mode") ?? "check";
  if (mode !== "check" && mode !== "google") return failure();

  if (step === "start") {
    if (!subdomain) return failure(404);
    const destination = destinationUrl(searchParams.get("returnTo") || "/", subdomain.origin);
    if (!destination) return failure();
    const state = randomBytes(32).toString("hex");
    const authorize = new URL(HANDOFF_PATH, parent);
    authorize.search = new URLSearchParams({ step: "authorize", returnTo: destination.href, state, mode }).toString();
    const response = redirect(authorize);
    setNonce(response, state, 300);
    return response;
  }

  if (step !== "authorize" || host !== parent.host) return failure(404);
  const state = searchParams.get("state");
  if (!state || !STATE_PATTERN.test(state)) return failure();
  let candidate: URL;
  try {
    candidate = new URL(searchParams.get("returnTo") ?? "");
  } catch {
    return failure();
  }
  const target = getSubdomainForHost(candidate.host);
  const destination = target ? destinationUrl(candidate.href, target.origin) : null;
  if (!destination) return failure();

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session) {
      if (mode === "check") return redirect(signInUrl(destination));
      const authorize = new URL(HANDOFF_PATH, parent);
      authorize.search = new URLSearchParams({ step, returnTo: destination.href, state, mode }).toString();
      const result = await auth.api.signInSocial({
        headers: request.headers,
        body: {
          provider: "google",
          callbackURL: authorize.href,
          errorCallbackURL: signInUrl(destination, true).href,
          disableRedirect: true,
        },
        asResponse: true,
      });
      if (!result.ok) return redirect(signInUrl(destination, true));
      const body = await result.json();
      if (typeof body.url !== "string" || new URL(body.url).protocol !== "https:") {
        return redirect(signInUrl(destination, true));
      }
      const response = redirect(new URL(body.url));
      copyCookies(result, response);
      return response;
    }
    if (session.user.status !== "active") return redirect(new URL("/account/suspended", parent));
    const { token } = await auth.api.generateOneTimeToken({ headers: request.headers });
    const complete = new URL("/auth/local-session", destination.origin);
    complete.hash = new URLSearchParams({ token, state, returnTo: destination.href }).toString();
    return redirect(complete);
  } catch {
    return redirect(signInUrl(destination, true));
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!usesLocalSubdomainSessions()) return failure(404);
  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  const target = getSubdomainForHost(host);
  if (!target) return failure(404);
  if (request.headers.get("origin") !== target.origin) return failure(403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure();
  }
  if (!body || typeof body !== "object" || !("token" in body) || !("state" in body) || !("returnTo" in body))
    return failure();
  const { token, state, returnTo } = body;
  const expectedState = request.cookies.get(nonceCookie())?.value;
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 256 ||
    typeof state !== "string" ||
    !STATE_PATTERN.test(state) ||
    !expectedState ||
    !STATE_PATTERN.test(expectedState) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
  )
    return failure(403);
  const destination = destinationUrl(returnTo, target.origin);
  if (!destination) return failure();

  try {
    const result = await auth.api.verifyOneTimeToken({
      headers: request.headers,
      body: { token },
      asResponse: true,
    });
    if (!result.ok) {
      const response = failure();
      setNonce(response, "", 0);
      return response;
    }
    const session = await result.json();
    if (session.user?.status !== "active") {
      const response = failure(403);
      setNonce(response, "", 0);
      return response;
    }
    const response = NextResponse.json({ redirectTo: destination.href }, { headers: RESPONSE_HEADERS });
    setNonce(response, "", 0);
    copyCookies(result, response);
    return response;
  } catch {
    const response = failure();
    setNonce(response, "", 0);
    return response;
  }
}
