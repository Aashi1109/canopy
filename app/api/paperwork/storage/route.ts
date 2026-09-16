import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { keyValuePairTable } from "@/db/schema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import { errorMessage } from "@/utils/errorMessage";
import { ApiInputError, assertJsonPayloadSize, assertRequestContentLength } from "../_lib/input";
import {
  getAnonymousUserId,
  PaperworkToolAccessError,
  requireAvailableToolForStorageKey,
} from "@/lib/paperwork/toolAccess";

export async function POST(request: NextRequest) {
  try {
    assertRequestContentLength(request.headers.get("content-length"));
    const body: unknown = await request.json();
    assertJsonPayloadSize(body);
    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof (body as { key?: unknown }).key !== "string" ||
      !("value" in body)
    ) {
      return NextResponse.json({ error: "Invalid storage data." }, { status: 400 });
    }

    const { key, value } = body as { key: string; value: unknown };
    await requireAvailableToolForStorageKey(key);
    const userId = getAnonymousUserId(request.headers.get("x-user-id"));
    await ensureDatabaseBootstrapped();
    await ensureUserExists(userId);

    await db
      .insert(keyValuePairTable)
      .values({ userId, key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [keyValuePairTable.userId, keyValuePairTable.key],
        set: { value, updatedAt: new Date() },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PaperworkToolAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to save anonymous Paperwork data", error);
    return NextResponse.json({ error: errorMessage(error, "Storage is unavailable.") }, { status: 500 });
  }
}
