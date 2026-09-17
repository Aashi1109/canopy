import { Cache } from "@canopy/cache";
import { assertDatabaseConfigured, authUser, db, eq } from "@canopy/database";

const userCache = new Cache("user");
const USER_TTL_SECONDS = 60 * 60;
type User = typeof authUser.$inferSelect;

export async function getCachedUser(userId: string): Promise<User | null> {
  assertDatabaseConfigured();
  const load = async () => {
    const [user] = await db.select().from(authUser).where(eq(authUser.id, userId)).limit(1);
    return user ?? null;
  };
  const value: unknown = await userCache.rememberGuarded(userId, load, USER_TTL_SECONDS);
  if (value === null) return null;
  if (!value || typeof value !== "object") return load();
  const user = value as Record<string, unknown>;
  const createdAt = new Date(user.createdAt as string | Date);
  const updatedAt = new Date(user.updatedAt as string | Date);
  if (
    user.id !== userId ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.emailVerified !== "boolean" ||
    (user.image !== null && typeof user.image !== "string") ||
    (user.status !== "active" && user.status !== "suspended") ||
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(updatedAt.getTime())
  )
    return load();
  return {
    id: userId,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    status: user.status,
    createdAt,
    updatedAt,
  };
}

/** Fence reads until the enclosing database operation commits or rolls back. */
export async function withUserCacheInvalidation<T>(
  operation: (invalidate: (userIds: readonly string[]) => Promise<void>) => Promise<T>,
): Promise<T> {
  const pending = new Map<string, string | null>();
  try {
    return await operation(async (userIds) => {
      for (const id of userIds) {
        if (!pending.has(id)) pending.set(id, await userCache.beginInvalidation(id, USER_TTL_SECONDS));
      }
    });
  } finally {
    await Promise.all([...pending].map(([id, token]) => userCache.endInvalidation(id, token, USER_TTL_SECONDS)));
  }
}
