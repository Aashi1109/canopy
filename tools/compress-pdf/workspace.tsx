"use client";

import { PdfFileWorkspace } from "@/components/PdfFileWorkspace";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import { parseSettings } from "@/lib/tool-framework/settings";
import definition from "./definition";
import { validate } from "./hooks";

export default function CompressPdfWorkspace(props: WorkspaceProps) {
  return <PdfFileWorkspace
    {...props}
    definitionKey="compress-pdf"
    optionsTitle="Compression settings"
    getPlan={(values, pageCount) => {
      const settings = parseSettings(definition.settings, values);
      const issue = validate(settings, []);
      if (issue) throw new Error(issue);
      if (settings.mode === "strong" && (pageCount > 200 || (props.input.files[0]?.size ?? 0) > 52_428_800)) {
        throw new Error("Strong Compression supports up to 200 pages and 50 MiB. Use Preserve Document for this PDF.");
      }
      return {
        title: `${pageCount} ${pageCount === 1 ? "page will" : "pages will"} be compressed`,
        detail: settings.mode === "strong"
          ? "Pages become images. Selectable text, links, forms, and accessibility information will be lost."
          : "Document content is preserved. The resulting file may not be smaller if it is already optimized.",
      };
    }}
  />;
}
