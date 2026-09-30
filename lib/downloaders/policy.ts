import type { PoolClient } from "pg";
import { sqlClient } from "../../db/runtime.ts";
import { hasPermission, mergeRoleAccess, type Role } from "../authorization/index.ts";
import { DownloadError, type DownloadPolicy, type OwnerDownloadLimits } from "./contracts.ts";

export type DownloadPolicyInput = { expectedVersion: number; guest: OwnerDownloadLimits; account: OwnerDownloadLimits };

export function validateDownloadPolicyInput(value: unknown): DownloadPolicyInput {
  if (!value || typeof value !== "object")
    throw new DownloadError("INVALID_POLICY", "Provide both downloader limit groups.");
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) {
    throw new DownloadError("INVALID_POLICY", "Reload the current limits before saving.");
  }
  const group = (name: string): OwnerDownloadLimits => {
    const values = input[name] as Record<string, unknown> | undefined;
    for (const [key, maximum] of Object.entries({ daily: 1_000_000, active: 250, queued: 10_000 })) {
      if (!values || !Number.isSafeInteger(values[key]) || Number(values[key]) < 1 || Number(values[key]) > maximum) {
        throw new DownloadError("INVALID_POLICY", `${name} ${key} must be a whole number from 1 to ${maximum}.`);
      }
    }
    return { daily: Number(values!.daily), active: Number(values!.active), queued: Number(values!.queued) };
  };
  return { expectedVersion: Number(input.expectedVersion), guest: group("guest"), account: group("account") };
}

// Each call is one short database phase. Callers must never await engine or storage I/O here.
export async function withDownloadTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await sqlClient.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readLockedDownloadPolicy(client: PoolClient, exclusive = false): Promise<DownloadPolicy> {
  const { rows } = await client.query(
    `SELECT * FROM download_policies WHERE id='default' FOR ${exclusive ? "UPDATE" : "SHARE"}`,
  );
  const row = rows[0];
  if (!row)
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Downloader limits are unavailable. Try again later.", 503, true);
  let checked: DownloadPolicyInput;
  try {
    checked = validateDownloadPolicyInput({
      expectedVersion: row.version,
      guest: { daily: row.guest_daily, active: row.guest_active, queued: row.guest_queued },
      account: { daily: row.account_daily, active: row.account_active, queued: row.account_queued },
    });
  } catch {
    throw new DownloadError("DOWNLOADS_UNAVAILABLE", "Downloader limits are unavailable. Try again later.", 503, true);
  }
  return {
    version: checked.expectedVersion,
    guest: checked.guest,
    account: checked.account,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function requirePolicyPermission(
  client: PoolClient,
  actorUserId: string,
  action: "view" | "edit",
): Promise<void> {
  const { rows } = await client.query(
    `SELECT u.status,r.id,r.name,r.description,r.access,r.is_system FROM auth_users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 FOR SHARE OF u,ur,r`,
    [actorUserId],
  );
  const roles: Role[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    access: row.access,
    isSystem: row.is_system,
  }));
  const access = mergeRoleAccess(roles);
  if (
    !rows.length ||
    rows[0].status !== "active" ||
    !hasPermission(access, "admin", "enter") ||
    !hasPermission(access, "downloaders", action)
  ) {
    throw new DownloadError("FORBIDDEN", "You do not have permission to manage downloader limits.", 403);
  }
}

export function getDownloadPolicy(actorUserId?: string): Promise<DownloadPolicy> {
  return withDownloadTransaction(async (client) => {
    if (actorUserId) await requirePolicyPermission(client, actorUserId, "view");
    return readLockedDownloadPolicy(client);
  });
}

export function saveDownloadPolicy(actorUserId: string, value: unknown): Promise<DownloadPolicy> {
  const input = validateDownloadPolicyInput(value);
  return withDownloadTransaction(async (client) => {
    await requirePolicyPermission(client, actorUserId, "edit");
    const before = await readLockedDownloadPolicy(client, true);
    if (input.expectedVersion !== before.version)
      throw new DownloadError("POLICY_CONFLICT", "These limits changed. Reload them before saving.", 409);
    await client.query(
      `UPDATE download_policies SET version=version+1,guest_daily=$1,guest_active=$2,guest_queued=$3,account_daily=$4,account_active=$5,account_queued=$6,updated_at=NOW() WHERE id='default'`,
      [
        input.guest.daily,
        input.guest.active,
        input.guest.queued,
        input.account.daily,
        input.account.active,
        input.account.queued,
      ],
    );
    const after = await readLockedDownloadPolicy(client);
    await client.query(
      `INSERT INTO audit_events(id,actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,'downloaders.policy-update','download-policy','default',$3)`,
      [crypto.randomUUID(), actorUserId, JSON.stringify({ before, after })],
    );
    return after;
  });
}
