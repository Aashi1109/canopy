import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vendorProfilesTable } from "@/db/schema";
import { ensureDatabaseBootstrapped, ensureUserExists } from "@/db/bootstrap";
import { errorMessage } from "@/utils/errorMessage";
import {
  ApiInputError,
  assertJsonPayloadSize,
  assertRequestContentLength,
  normalizeVendorPayload,
} from "../_lib/input";
import {
  getAnonymousUserId,
  PaperworkToolAccessError,
  requireAnyAvailablePaperworkTool,
} from "@/lib/paperwork/toolAccess";

const VENDOR_TOOL_SLUGS = ["w9-request", "1099-nec-tracker"] as const;
async function prepareRequest(request: NextRequest) {
  await requireAnyAvailablePaperworkTool(VENDOR_TOOL_SLUGS);
  const userId = getAnonymousUserId(request.headers.get("x-user-id"));
  await ensureDatabaseBootstrapped();
  await ensureUserExists(userId);
  return userId;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await prepareRequest(request);
    const vendors = await db.select().from(vendorProfilesTable).where(eq(vendorProfilesTable.userId, userId));
    return NextResponse.json({ success: true, vendors });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertRequestContentLength(request.headers.get("content-length"));
    const body: unknown = await request.json();
    assertJsonPayloadSize(body);
    const vendors = normalizeVendorPayload(body);

    const userId = await prepareRequest(request);
    await db.transaction(async (transaction) => {
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof ApiInputError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof PaperworkToolAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Failed to access anonymous Paperwork vendors", error);
  return NextResponse.json({ error: errorMessage(error, "Vendor storage is unavailable.") }, { status: 500 });
}
