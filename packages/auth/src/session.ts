import { hasPermission } from "@smarttools/authorization";
import { AuthorizationError, getUserAuthorization } from "@smarttools/control-plane";
import { auth } from "./auth.ts";

export type AuthServiceSession = {
  session: { id: string };
  user: { id: string; name: string; status: string; isAdmin?: boolean };
};

export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const { access } = await getUserAuthorization(userId);
    return hasPermission(access, "admin", "enter");
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export class AuthServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuthServiceError";
  }
}

export async function getSession(requestHeaders: Headers): Promise<AuthServiceSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
    if (!session) return null;

    return {
      session: { id: session.session.id },
      user: {
        id: session.user.id,
        name: session.user.name,
        status: session.user.status === "active" ? "active" : "suspended",
        isAdmin: await isAdminUser(session.user.id),
      },
    };
  } catch (cause) {
    throw new AuthServiceError("Authentication is unavailable.", {
      cause,
    });
  }
}

export async function getOptionalSession(
  requestHeaders: Headers,
): Promise<AuthServiceSession | null> {
  try {
    return await getSession(requestHeaders);
  } catch (error) {
    if (error instanceof AuthServiceError) return null;
    throw error;
  }
}
