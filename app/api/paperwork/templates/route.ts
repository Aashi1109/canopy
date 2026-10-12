import { getPublishedTemplates } from "@/lib/admin/index.ts";
import { DocumentTypeSchema, getDocumentDefinition } from "@/lib/invoice-templates/index.ts";
import { NextResponse } from "next/server";
import { reportPaperworkFailure } from "../_lib/input";

import { getPaperworkTools } from "@/lib/tool-framework/catalog";

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
    const tools = await getPaperworkTools();
    if (!tools.some((tool) => tool.componentKey === componentKey)) {
      return NextResponse.json({ error: "Tool not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      templates: await getPublishedTemplates(validatedDocumentType),
    });
  } catch (error) {
    reportPaperworkFailure(error, "Templates are temporarily unavailable.");
    return NextResponse.json({ error: "Templates are temporarily unavailable." }, { status: 500 });
  }
}
