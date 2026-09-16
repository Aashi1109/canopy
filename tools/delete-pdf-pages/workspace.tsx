"use client";

/**
 * Per-page selection on the thumbnails.
 *
 * The selection is the `pages` setting — written as a page expression through
 * `onSettingChange`, so `run.worker.ts` and the text field in the settings
 * panel see the same value. `hooks.ts` starts a new document with nothing
 * selected and reports an empty selection before the run.
 */

import { FileProcessorWorkspace } from "@/components/FileProcessorWorkspace";
import {
  PdfPagesSurface,
  pageExpression,
  selectedPageNumbers,
  usePdfPageImages,
} from "@/components/PdfPagesSurface";
import type { WorkspaceProps } from "@/components/ToolWorkspace";
import type { ToolPagePreview } from "@/lib/tool-framework/run";

const PAGES = "pages";

interface PagePickerProps {
  disabled: boolean;
  inspecting: boolean;
  onSettingChange: WorkspaceProps["onSettingChange"];
  previews: readonly ToolPagePreview[];
  value: unknown;
}

function PagePicker({ disabled, inspecting, onSettingChange, previews, value }: PagePickerProps) {
  const images = usePdfPageImages(previews);
  const selected = selectedPageNumbers(value, images);
  // Deleting every page would leave no document, so the last unselected page
  // cannot be selected. Locking it says so instead of failing at run time.
  const locked = new Set(
    selected.size >= images.length - 1
      ? images.map(({ pageNumber }) => pageNumber).filter((pageNumber) => !selected.has(pageNumber))
      : [],
  );

  return (
    <PdfPagesSurface
      description="Selected pages are removed. At least one page must remain."
      disabled={disabled}
      inspecting={inspecting}
      lockedPages={locked}
      onToggle={(pageNumber) => {
        const next = new Set(selected);
        if (!next.delete(pageNumber)) next.add(pageNumber);
        onSettingChange(PAGES, pageExpression(next));
      }}
      pages={images}
      selected={selected}
      title="Pages to delete"
    />
  );
}

export default function DeletePdfPagesWorkspace(props: WorkspaceProps) {
  return (
    <FileProcessorWorkspace
      {...props}
      detail={({ disabled, inspecting, previews }) => (
        <PagePicker
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
