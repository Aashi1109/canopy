import {
  getPaperworkSession,
  resolvePaperworkSession,
  assertPaperworkOwner,
  applyPaperworkSession,
  assertSameOriginWrite,
  PaperworkSessionError,
} from "../_lib/session";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/paperwork";
import { vendorProfilesTable } from "@/db/paperworkSchema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import {
  reportPaperworkFailure,
  readJsonBody,
  ApiInputError,
  assertJsonPayloadSize,
  assertRequestContentLength,
  normalizeVendorPayload,
} from "../_lib/input";
import { PaperworkToolAccessError, requireAnyAvailablePaperworkTool } from "@/lib/paperwork/toolAccess";

const VENDOR_TOOL_SLUGS = ["w9-request", "1099-nec-tracker"] as const;
async function prepareRequest(request: NextRequest, existingSession?: ReturnType<typeof getPaperworkSession>) {
  const session = existingSession ?? (await resolvePaperworkSession(request));
  await requireAnyAvailablePaperworkTool(VENDOR_TOOL_SLUGS);
  const { userId } = session;
  await ensureDatabaseBootstrapped();
  await ensureUserExists(userId);
  return { userId, session };
}

export async function GET(request: NextRequest) {
  let session: ReturnType<typeof getPaperworkSession> | null = null;
  try {
    session = await resolvePaperworkSession(request);
    const { userId } = await prepareRequest(request, session);
    const vendors = await db.select().from(vendorProfilesTable).where(eq(vendorProfilesTable.userId, userId));
    return applyPaperworkSession(NextResponse.json({ success: true, vendors }), session, request);
  } catch (error) {
    return session ? applyPaperworkSession(handleError(error), session, request) : handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginWrite(request);
    assertRequestContentLength(request.headers.get("content-length"));
    const body: unknown = await readJsonBody(request);
    assertJsonPayloadSize(body);
    const vendors = normalizeVendorPayload(body);

    const { userId, session } = await prepareRequest(request);
    assertPaperworkOwner(request, userId);
    await db.transaction(async (transaction) => {
      await transaction.delete(vendorProfilesTable).where(eq(vendorProfilesTable.userId, userId));
      for (const vendor of vendors) {
        const { id, ...profile } = vendor;
        const values = { ...profile, updatedAt: new Date() };
        await transaction
          .insert(vendorProfilesTable)
          .values({ userId, id, ...values })
          .onConflictDoUpdate({
            target: [vendorProfilesTable.userId, vendorProfilesTable.id],
            set: values,
          });
      }
    });

    return applyPaperworkSession(NextResponse.json({ success: true }), session, request);
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof PaperworkSessionError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof ApiInputError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PaperworkToolAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  reportPaperworkFailure(error, "Vendor storage is unavailable.");
  return NextResponse.json({ error: "Vendor storage is unavailable." }, { status: 500 });
}
