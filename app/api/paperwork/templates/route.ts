import { getAvailableTools, getPublishedTemplates } from "@/lib/admin/index.ts";
import { DocumentTypeSchema, getDocumentDefinition } from "@/lib/invoice-templates/index.ts";
import { NextResponse } from "next/server";
import { captureException } from "@sentry/core";

import { getToolManifest } from "@/lib/tool-framework/manifest";
import { errorMessage } from "@/utils/errorMessage";

export async function GET(request: Request) {
  try {
    const documentTypes = new URL(request.url).searchParams.getAll("documentType");
    const documentType = documentTypes.length === 0 ? "invoice" : documentTypes[0];
    const parsedDocumentType = DocumentTypeSchema.safeParse(documentType);
    if (documentTypes.length > 1 || !parsedDocumentType.success) {
      return NextResponse.json({ error: "Invalid documentType." }, { status: 400 });
    }

    const validatedDocumentType = parsedDocumentType.data;
    const componentKey = getDocumentDefinition(validatedDocumentType).toolComponentKey;
    const tools = await getAvailableTools("paperwork", await getToolManifest());
    if (!tools.some((tool) => tool.componentKey === componentKey)) {
      return NextResponse.json({ error: "Tool not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      templates: await getPublishedTemplates(validatedDocumentType),
    });
  } catch (error) {
    captureException(error);
    console.error("Failed to fetch published document templates", error);
    return NextResponse.json({ error: errorMessage(error, "Templates are temporarily unavailable.") }, { status: 500 });
  }
}
