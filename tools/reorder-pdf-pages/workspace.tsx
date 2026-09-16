"use client";

/**
 * Drag-to-reorder page thumbnails.
 *
 * The order is the `pages` setting, seeded from the document by
 * `hooks.ts#onPagesInspected` and edited here through `onSettingChange`, so
 * `run.worker.ts` reads exactly what the user arranged. There is no local
 * order state to fall out of step with it.
 */

import { FileProcessorWorkspace } from "@/components/FileProcessorWorkspace";
import { PdfPagesSurface, usePdfPageImages, type PdfPageImage } from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import type { ToolPagePreview } from "@/lib/tool-framework/run";

const PAGES = "pages";

/**
 * The pages in the order the setting asks for. An order that does not name
 * every page exactly once cannot be rendered as a reordering, so the document's
 * own order stands in until the seed lands.
 */
function orderedPages(value: unknown, pages: readonly PdfPageImage[]): readonly PdfPageImage[] {
  if (!Array.isArray(value)) return pages;
  const byPageNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const ordered: PdfPageImage[] = [];
  for (const entry of value) {
    if (typeof entry !== "number") continue;
    const page = byPageNumber.get(entry);
    if (!page) continue;
    byPageNumber.delete(entry);
    ordered.push(page);
  }
  return ordered.length === pages.length ? ordered : pages;
}

interface PageOrderProps {
  disabled: boolean;
  inspecting: boolean;
  onSettingChange: WorkspaceProps["onSettingChange"];
  previews: readonly ToolPagePreview[];
  value: unknown;
}

function PageOrder({ disabled, inspecting, onSettingChange, previews, value }: PageOrderProps) {
  const images = usePdfPageImages(previews);
  return (
    <PdfPagesSurface
      description="Drag any page card to reorder. Click to preview; on touch, hold to drag."
      disabled={disabled}
      inspecting={inspecting}
      onOrderChange={(pageNumbers) => onSettingChange(PAGES, [...pageNumbers])}
      pages={orderedPages(value, images)}
      title="Page order"
    />
  );
}

export default function ReorderPdfPagesWorkspace(props: WorkspaceProps) {
  return (
    <FileProcessorWorkspace
      {...props}
      detail={({ disabled, inspecting, previews }) => (
        <PageOrder
          disabled={disabled}
          inspecting={inspecting}
          onSettingChange={props.onSettingChange}
          previews={previews}
          value={props.settings[PAGES]}
        />
      )}
    />
  );
}
