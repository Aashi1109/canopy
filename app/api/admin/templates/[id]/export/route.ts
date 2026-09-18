import { AuthServiceError, getSession } from "@canopy/auth/session";
import { requirePermission } from "@canopy/control-plane";
import { db, eq, invoiceTemplatesTable } from "@canopy/database";
import { errorMessage } from "@/utils/errorMessage";
import { captureException } from "@sentry/core";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let session;
    try {
      session = await getSession(request.headers);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        captureException(error);
        return Response.json({ error: errorMessage(error, "Authentication service unavailable") }, { status: 503 });
      }
      throw error;
    }

    if (!session) return Response.json({ error: "Authentication required" }, { status: 401 });

    try {
      await requirePermission(session.user.id, "templates", "view");
    } catch (error) {
      return Response.json({ error: errorMessage(error, "Forbidden") }, { status: 403 });
    }

    const [template] = await db
      .select()
      .from(invoiceTemplatesTable)
      .where(eq(invoiceTemplatesTable.id, (await params).id))
      .limit(1);
    if (!template) return Response.json({ error: "Not found" }, { status: 404 });

    return new Response(
      JSON.stringify(
        {
          ...template,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
        },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${template.slug}.json"`,
        },
      },
    );
  } catch (error) {
    captureException(error);
    return Response.json({ error: errorMessage(error, "Unable to export template") }, { status: 500 });
  }
}
