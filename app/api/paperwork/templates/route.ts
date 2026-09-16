import { getAvailableTools, getPublishedTemplates } from "@smarttools/control-plane";
import { DocumentTypeSchema, getDocumentDefinition } from "@smarttools/invoice-templates";
import { NextResponse } from "next/server";

import { getToolManifest } from "@/lib/tool-framework/manifest";

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
    console.error("Failed to fetch published document templates", error);
    return NextResponse.json({ error: "Templates are temporarily unavailable." }, { status: 500 });
  }
}
