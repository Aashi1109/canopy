import { assertCanDeleteUser } from "@canopy/authorization";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  and,
  countDistinct,
  db,
  eq,
  userRolesTable,
} from "@canopy/database";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { cachedUserAdapter } from "./cachedUserAdapter.ts";
import { sendAuthEmail } from "./email.ts";
import { normalizeAccountName, normalizeProfileImage } from "./security.ts";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";

async function notifyPasswordChanged(email: string): Promise<void> {
  try {
    await sendAuthEmail({
      to: email,
      subject: "Your SmartTools password was changed",
      heading: "Password changed",
      message:
        "Your SmartTools password was changed successfully. If you made this change, no action is needed. If this wasn't you, reset your password immediately to secure your account.",
      actionLabel: "Reset password",
      actionUrl: new URL("/auth?mode=forgot", baseURL).href,
    });
  } catch {
    // The password is already saved; notification failure must not interrupt session revocation.
    console.error("Unable to send password-change confirmation email");
  }
}

async function assertAccountCanBeDeleted(userId: string): Promise<void> {
  const assignments = await db
    .select({ roleId: userRolesTable.roleId })
    .from(userRolesTable)
    .where(eq(userRolesTable.userId, userId));

  if (!assignments.some(({ roleId }) => roleId === "admin")) return;

  const [allAdmins, activeAdmins] = await Promise.all([
    db
      .select({ count: countDistinct(userRolesTable.userId) })
      .from(userRolesTable)
      .where(eq(userRolesTable.roleId, "admin")),
    db
      .select({ count: countDistinct(userRolesTable.userId) })
      .from(userRolesTable)
      .innerJoin(authUser, eq(authUser.id, userRolesTable.userId))
      .where(and(eq(userRolesTable.roleId, "admin"), eq(authUser.status, "active"))),
  ]);

  assertCanDeleteUser(
    {
      status: "active",
      roles: assignments.map(({ roleId }) => roleId),
    },
    {
      adminCount: Number(allAdmins[0]?.count ?? 0),
      activeAdminCount: Number(activeAdmins[0]?.count ?? 0),
    },
  );
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: "SmartTools",
  baseURL,
  database: (options: BetterAuthOptions) =>
    cachedUserAdapter(
      drizzleAdapter(db, {
        provider: "pg",
        schema: { authUser, authSession, authAccount, authVerification },
        transaction: true,
      })(options),
    ),
  trustedOrigins: [new URL(baseURL).origin],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: ({ user }) => notifyPasswordChanged(user.email),
    sendResetPassword: ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Reset your SmartTools password",
        heading: "Reset your password",
        actionLabel: "Reset password",
        actionUrl: url,
      }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Verify your SmartTools email",
        heading: "Verify your email",
        actionLabel: "Verify email",
        actionUrl: url,
      }),
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  user: {
    modelName: "authUser",
    additionalFields: {
      status: {
        type: "string",
        required: false,
        defaultValue: "active",
        input: false,
      },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: ({ id }) => assertAccountCanBeDeleted(id),
      sendDeleteAccountVerification: ({ user, url }) =>
        sendAuthEmail({
          to: user.email,
          subject: "Confirm SmartTools account deletion",
          heading: "Delete your account",
          actionLabel: "Delete account",
          actionUrl: url,
        }),
    },
  },
  session: { modelName: "authSession" },
  account: {
    modelName: "authAccount",
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  verification: {
    modelName: "authVerification",
    storeIdentifier: "hashed",
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const result = ctx.context.returned;
      if (result && typeof result === "object" && "user" in result && ctx.context.session) {
        await notifyPasswordChanged(ctx.context.session.user.email);
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            name: normalizeAccountName(user.name),
            image: normalizeProfileImage(user.image),
          },
        }),
        after: async (user) => {
          await db.insert(userRolesTable).values({ userId: user.id, roleId: "user" }).onConflictDoNothing();
        },
      },
      update: {
        before: async (user) => ({
          data: {
            ...user,
            ...(Object.hasOwn(user, "name") ? { name: normalizeAccountName(user.name) } : {}),
            ...(Object.hasOwn(user, "image") ? { image: normalizeProfileImage(user.image) } : {}),
          },
        }),
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    disableCSRFCheck: false,
    disableOriginCheck: false,
    cookiePrefix: "smarttools",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
