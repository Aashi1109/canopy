import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keyValuePairTable } from "@/db/schema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import { errorMessage } from "@/utils/errorMessage";
import {
  getAnonymousUserId,
  PaperworkToolAccessError,
  requireAvailableToolForStorageKey,
} from "@/lib/paperwork/toolAccess";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    await requireAvailableToolForStorageKey(key);
    const userId = getAnonymousUserId(request.headers.get("x-user-id"));
    await ensureDatabaseBootstrapped();
    await ensureUserExists(userId);

    const rows = await db
      .select()
      .from(keyValuePairTable)
      .where(and(eq(keyValuePairTable.userId, userId), eq(keyValuePairTable.key, key)))
      .limit(1);

    return NextResponse.json(rows[0] ? { found: true, value: rows[0].value } : { found: false, value: null });
  } catch (error) {
    if (error instanceof PaperworkToolAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to load anonymous Paperwork data", error);
    return NextResponse.json({ error: errorMessage(error, "Storage is unavailable.") }, { status: 500 });
  }
}
