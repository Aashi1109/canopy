import { validatePaperworkStorageValue, PaperworkStorageValidationError } from "@/lib/paperwork/storageValidation";
import {
  resolvePaperworkSession,
  assertPaperworkOwner,
  applyPaperworkSession,
  assertSameOriginWrite,
  PaperworkSessionError,
} from "../_lib/session";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/paperwork";
import { keyValuePairTable } from "@/db/paperworkSchema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import {
  reportPaperworkFailure,
  readJsonBody,
  ApiInputError,
  assertJsonPayloadSize,
  assertRequestContentLength,
} from "../_lib/input";
import { PaperworkToolAccessError, requireAvailableToolForStorageKey } from "@/lib/paperwork/toolAccess";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginWrite(request);
    assertRequestContentLength(request.headers.get("content-length"));
    const body: unknown = await readJsonBody(request);
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
    validatePaperworkStorageValue(key, value);
    const session = await resolvePaperworkSession(request);
    const { userId } = session;
    assertPaperworkOwner(request, userId);
    await ensureDatabaseBootstrapped();
    await ensureUserExists(userId);

    await db
      .insert(keyValuePairTable)
      .values({ userId, key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [keyValuePairTable.userId, keyValuePairTable.key],
        set: { value, updatedAt: new Date() },
      });

    return applyPaperworkSession(NextResponse.json({ success: true }), session, request);
  } catch (error) {
    if (error instanceof PaperworkSessionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PaperworkStorageValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ApiInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PaperworkToolAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    reportPaperworkFailure(error, "Storage is unavailable.");
    return NextResponse.json({ error: "Storage is unavailable." }, { status: 500 });
  }
}
