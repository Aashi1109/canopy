import { createHash, randomBytes } from "node:crypto";
import { getSession } from "@/lib/auth/session.ts";

const COOKIE_NAME = "paperwork_session";
export class PaperworkSessionError extends Error {
  readonly status = 403;
}

// The cookie is a 256-bit bearer credential; only its digest is used as a DB owner.
// A separate namespace prevents claiming records previously owned by browser IDs.
export function getPaperworkSession(request: Request) {
  const existing = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  const isNew = !existing || !/^[a-f0-9]{64}$/.test(existing);
  const token = isNew ? randomBytes(32).toString("hex") : existing!;
  return { token, isNew, userId: `anon_v2_${createHash("sha256").update(token).digest("hex")}` };
}

export async function resolvePaperworkSession(request: Request) {
  const anonymous = getPaperworkSession(request);
  const authenticated = await getSession(request.headers, { includeAdmin: false });
  if (!authenticated) return anonymous;
  if (authenticated.user.status !== "active")
    throw new PaperworkSessionError("This account cannot access saved drafts.");
  return { ...anonymous, userId: `account_v2_${createHash("sha256").update(authenticated.user.id).digest("hex")}` };
}

export function assertPaperworkOwner(request: Request, owner: string): void {
  const expected = request.headers.get("x-paperwork-owner");
  if ((owner.startsWith("account_v2_") && !expected) || (expected && expected !== owner)) {
    throw new PaperworkSessionError("The draft owner changed. Reload before saving changes.");
  }
}

export function assertSameOriginWrite(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new PaperworkSessionError("A same-origin request is required.");
  }
}

export function applyPaperworkSession<T extends Response>(
  response: T,
  session: ReturnType<typeof getPaperworkSession>,
  request: Request,
): T {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("x-paperwork-owner", session.userId);
  if (session.isNew) {
    const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
    response.headers.append(
      "set-cookie",
      `${COOKIE_NAME}=${session.token}; Path=/api/paperwork; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? "; Secure" : ""}`,
    );
  }
  return response;
}
