import { getCachedUser, withUserCacheInvalidation } from "@canopy/control-plane";
import type { authSession } from "@canopy/database";
import type { DBAdapter, DBTransactionAdapter } from "better-auth";

type InvalidateUsers = (userIds: readonly string[]) => Promise<void>;
type UserMutation = Parameters<DBAdapter["delete"]>[0];

async function affectedUserIds(adapter: DBTransactionAdapter, args: UserMutation): Promise<string[]> {
  const [where] = args.where;
  if (
    args.where.length === 1 &&
    where.field === "id" &&
    (!where.operator || where.operator === "eq") &&
    (!where.mode || where.mode === "sensitive") &&
    typeof where.value === "string"
  ) {
    return [where.value];
  }
  const limit = await adapter.count(args);
  if (!limit) return [];
  const users = await adapter.findMany<{ id: string }>({ ...args, select: ["id"], limit });
  return users.map(({ id }) => id);
}

function withInvalidatedWrites(
  adapter: DBTransactionAdapter,
  invalidate?: InvalidateUsers,
): DBTransactionAdapter {
  const mutate = <T>(args: UserMutation, operation: () => Promise<T>): Promise<T> => {
    if (args.model !== "user" && args.model !== "authUser") return operation();
    const run = async (invalidateUsers: InvalidateUsers) => {
      await invalidateUsers(await affectedUserIds(adapter, args));
      return operation();
    };
    return invalidate ? run(invalidate) : withUserCacheInvalidation(run);
  };
  return {
    ...adapter,
    update: <T>(args: Parameters<DBAdapter["update"]>[0]) =>
      mutate(args, () => adapter.update<T>(args)),
    updateMany: (args) => mutate(args, () => adapter.updateMany(args)),
    delete: (args) => mutate(args, () => adapter.delete(args)),
    deleteMany: (args) => mutate(args, () => adapter.deleteMany(args)),
  };
}

export function cachedUserAdapter(adapter: DBAdapter): DBAdapter {
  return {
    ...withInvalidatedWrites(adapter),
    async findOne<T>(args: Parameters<DBAdapter["findOne"]>[0]): Promise<T | null> {
      if (
        args.model !== "session" ||
        args.join?.user !== true ||
        Object.keys(args.join).length !== 1 ||
        args.select
      ) {
        return adapter.findOne<T>(args);
      }
      const session = await adapter.findOne<typeof authSession.$inferSelect>({
        ...args,
        join: undefined,
      });
      if (!session) return null;
      return { ...session, user: await getCachedUser(session.userId) } as T;
    },
    transaction: (callback) =>
      withUserCacheInvalidation((invalidate) =>
        adapter.transaction((transaction) => callback(withInvalidatedWrites(transaction, invalidate))),
      ),
  };
}
