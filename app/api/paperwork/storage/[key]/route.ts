import { reportPaperworkFailure } from "../../_lib/input";
import { resolvePaperworkSession, applyPaperworkSession, PaperworkSessionError } from "../../_lib/session";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/paperwork";
import { keyValuePairTable } from "@/db/paperworkSchema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import { PaperworkToolAccessError, requireAvailableToolForStorageKey } from "@/lib/paperwork/toolAccess";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    await requireAvailableToolForStorageKey(key);
    const session = await resolvePaperworkSession(request);
    const { userId } = session;
    await ensureDatabaseBootstrapped();
    await ensureUserExists(userId);

    const rows = await db
      .select()
      .from(keyValuePairTable)
      .where(and(eq(keyValuePairTable.userId, userId), eq(keyValuePairTable.key, key)))
      .limit(1);

    return applyPaperworkSession(
      NextResponse.json(rows[0] ? { found: true, value: rows[0].value } : { found: false, value: null }),
      session,
      request,
    );
  } catch (error) {
    if (error instanceof PaperworkSessionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PaperworkToolAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    reportPaperworkFailure(error, "Storage is unavailable.");
    return NextResponse.json({ error: "Storage is unavailable." }, { status: 500 });
  }
}
