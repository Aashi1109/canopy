"use client";
import { useTranslations, useFormatter } from "next-intl";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  MediaPreview,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/index.tsx";
import { ArtifactDownloadButton, useFileDownload } from "@/components/ArtifactDownloadButton";
import { WorkspaceSurface } from "@/components/Surfaces";
import { MediaOutputCard } from "@/components/ui/components/MediaOutputCard.tsx";
import { OrderableList } from "@/components/ui/components/OrderableList.tsx";
import { workspaceFileId } from "@/components/FileInput";
import { GripVertical, Minus, Plus } from "lucide-react";
import { readArtifact, type StoredToolArtifact } from "@/lib/tool-framework/artifacts";

function sizeLabel(bytes: number) {
  return bytes < 1000
    ? `${bytes} B`
    : bytes < 1_000_000
      ? `${(bytes / 1000).toFixed(1)} KB`
      : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

type ImageFile = File | StoredToolArtifact;

function isArtifact(file: ImageFile): file is StoredToolArtifact {
  return "storage" in file;
}

function metadata(file: ImageFile, imageLabel: string) {
  const format = file.name.split(".").pop()?.toUpperCase() || imageLabel;
  return `${format} · ${sizeLabel(file.size)}`;
}

function previewFailureKey(file: ImageFile) {
  const mime = isArtifact(file) ? file.mime : file.type;
  return /hei[cf]/i.test(mime) || /\.hei[cf]$/i.test(file.name) ? "mediaHeicPreviewFailed" : "mediaImagePreviewFailed";
}

function useImageFile(file: ImageFile, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ file: ImageFile; attempt: number; url: string }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoaded(undefined);
    setError(false);
    if (!enabled) return;
    let disposed = false;
    let objectUrl: string | undefined;
    void (isArtifact(file) ? readArtifact(file) : Promise.resolve(file))
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ file, attempt, url: objectUrl });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, enabled, attempt]);
  const url = loaded?.file === file && loaded.attempt === attempt ? loaded.url : undefined;
  return { url, error, fail: () => setError(true), retry: () => setAttempt((value) => value + 1) };
}

function Thumbnail({ file, cover = false }: { file: ImageFile; cover?: boolean }) {
  const t = useTranslations("Workbench");
  const image = useImageFile(file, true);
  return (
    <span className="flex h-full w-full items-center justify-center overflow-hidden text-xs text-muted-foreground">
      {image.error ? (
        <span className="whitespace-normal px-4 pt-10 text-center font-normal">
          {t("mediaOpenPreviewRetry", { error: t(previewFailureKey(file)) })}
        </span>
      ) : image.url ? (
        <img
          src={image.url}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={image.fail}
          className={`h-full w-full ${cover ? "object-cover" : "object-contain"}`}
        />
      ) : (
        t("loading")
      )}
    </span>
  );
}

function OutputCard({
  file,
  onPreview,
  disabled,
  primary,
}: {
  file: StoredToolArtifact;
  onPreview: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const t = useTranslations("Workbench");
  const { download, downloading, error } = useFileDownload(file);
  return (
    <MediaOutputCard
      name={file.name}
      metadata={metadata(file, t("mediaImageType"))}
      onPreview={onPreview}
      onDownload={primary ? undefined : () => void download()}
      disabled={disabled}
      downloading={downloading}
      error={error}
    >
      <Thumbnail file={file} />
    </MediaOutputCard>
  );
}

function ImagePreviewDialog({
  files,
  selected,
  onSelect,
  onClose,
  onRemove,
  disabled,
}: {
  files: readonly ImageFile[];
  selected: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  onRemove?: (file: File) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Workbench");
  const format = useFormatter();
  const file = files[selected];
  const image = useImageFile(file, true);
  const viewport = useRef<HTMLDivElement | null>(null);
  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null);
  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    viewport.current = node;
    setViewportNode(node);
  }, []);
  const activeThumbnail = useRef<HTMLButtonElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    setZoom(null);
    setDimensions({ width: 0, height: 0 });
    activeThumbnail.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [file]);
  useEffect(() => {
    const node = viewportNode;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setArea({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewportNode]);
  const fit =
    dimensions.width && dimensions.height
      ? Math.min(area.width / dimensions.width, area.height / dimensions.height) * 100
      : 100;
  const scale = zoom ?? fit;
  function changeZoom(value: number | null) {
    setZoom(value === null ? null : Math.min(400, Math.max(10, value)));
    viewport.current?.scrollTo({ left: 0, top: 0 });
  }
  return (
    <MediaPreview
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={file.name}
      actions={
        isArtifact(file) ? (
          <ArtifactDownloadButton file={file} key={file.id} size="sm" disabled={disabled} />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onClose();
              onRemove?.(file);
            }}
          >
            {t("mediaRemoveImage")}
          </Button>
        )
      }
      description={t("mediaImagePosition", {
        kind: isArtifact(file) ? "generated" : "source",
        position: selected + 1,
        count: files.length,
        size: sizeLabel(file.size),
      })}
      hint={t("mediaZoomPanHint")}
      viewportClassName="relative overflow-hidden bg-transparent"
      controls={
        <>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={t("zoomOut")}
            disabled={!image.url || image.error || scale <= 10}
            onClick={() => changeZoom(scale - 10)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-10 text-center text-xs tabular-nums">{format.number(Math.round(scale))}%</span>
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label={t("zoomIn")}
            disabled={!image.url || image.error || scale >= 400}
            onClick={() => changeZoom(scale + 10)}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => changeZoom(null)}>
            {t("mediaFitScreen")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => changeZoom(100)}>
            100%
          </Button>
        </>
      }
    >
      <div
        ref={attachViewport}
        className="flex h-full min-h-0 w-full overflow-auto"
        style={{ cursor: zoom !== null && scale > fit ? "grab" : undefined }}
        onPointerDown={(event) => {
          if (zoom === null || scale <= fit || event.button !== 0) return;
          const node = event.currentTarget;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: node.scrollLeft,
            top: node.scrollTop,
          };
          node.setPointerCapture(event.pointerId);
          setPanning(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
          event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
        }}
        onPointerUp={() => {
          drag.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPanning(false);
        }}
      >
        {image.error ? (
          <div role="alert" className="m-auto text-center">
            <p>{t(previewFailureKey(file))}</p>
            <Button variant="secondary" className="mt-3" onClick={image.retry}>
              {t("mediaRetryPreview")}
            </Button>
          </div>
        ) : image.url ? (
          <img
            alt={file.name}
            src={image.url}
            draggable={false}
            onError={image.fail}
            onLoad={(event) =>
              setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            className="m-auto max-w-none shrink-0 object-contain"
            style={
              dimensions.width
                ? {
                    width: (dimensions.width * scale) / 100,
                    height: (dimensions.height * scale) / 100,
                  }
                : { maxWidth: "100%", maxHeight: "100%" }
            }
          />
        ) : (
          <p role="status" className="m-auto">
            {t("loadingPreview")}
          </p>
        )}
      </div>
      {files.length > 1 && (
        <nav
          aria-label={isArtifact(file) ? t("mediaOutputImages") : t("mediaSourceImages")}
          className={`absolute bottom-4 left-4 flex max-h-[65%] max-w-[calc(100%-2rem)] gap-3 overflow-auto p-1 sm:top-1/2 sm:bottom-auto sm:max-w-none sm:-translate-y-1/2 sm:flex-col ${panning ? "opacity-0 pointer-events-none" : ""}`}
        >
          {files.map((entry, index) => (
            <Button
              key={isArtifact(entry) ? entry.id : index}
              ref={index === selected ? activeThumbnail : undefined}
              variant="secondary"
              aria-label={t("mediaPreviewNamedImage", { position: index + 1, name: entry.name })}
              aria-current={index === selected ? "true" : undefined}
              className={`size-16 shrink-0 overflow-hidden p-0 sm:size-24 ${index === selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
              onClick={() => onSelect(index)}
            >
              <Thumbnail file={entry} cover />
            </Button>
          ))}
        </nav>
      )}
    </MediaPreview>
  );
}

function ImageGallery<T extends ImageFile>({
  files,
  onRemove,
  disabled,
  actions,
  onReorder,
  header,
  primaryOutputId,
}: {
  files: readonly T[];
  onRemove?: (file: File) => void;
  disabled?: boolean;
  actions?: ReactNode;
  onReorder?: (files: T[]) => void;
  header?: "visible" | "sr-only";
  primaryOutputId?: string;
}) {
  const t = useTranslations("Workbench");
  const [selectedFile, setSelectedFile] = useState<T | null>(null);
  const selected = selectedFile ? files.indexOf(selectedFile) : -1;
  const input = Boolean(onRemove);
  const renderCard = (file: T) =>
    isArtifact(file) ? (
      <OutputCard
        file={file}
        key={file.id}
        onPreview={() => setSelectedFile(file)}
        disabled={disabled}
        primary={file.id === primaryOutputId}
      />
    ) : (
      <MediaOutputCard
        key={workspaceFileId(file)}
        name={file.name}
        metadata={metadata(file, t("mediaImageType"))}
        onPreview={() => setSelectedFile(file)}
        onRemove={() => onRemove?.(file)}
        disabled={disabled}
      >
        <Thumbnail file={file} />
      </MediaOutputCard>
    );
  const gridClassName = "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] items-start gap-4 pr-2";
  return (
    <WorkspaceSurface
      actions={actions}
      header={header}
      className="flex-1"
      contentClassName="gap-4 p-4 sm:p-6 max-sm:[&_button]:!min-h-11 max-sm:[&_button]:!min-w-11 [@media(pointer:coarse)]:[&_button]:!min-h-11 [@media(pointer:coarse)]:[&_button]:!min-w-11"
      data-slot={input ? "media-input-gallery" : "media-output-gallery"}
      meta={t("mediaImageCount", { count: files.length })}
      purpose={input ? "source" : "result"}
      title={
        header === "sr-only" ? (
          input ? (
            t("mediaSelectedImages")
          ) : (
            t("mediaConvertedImages")
          )
        ) : (
          <span role="heading" aria-level={2}>
            {input ? t("mediaSelectedImages") : t("mediaConvertedImages")}
          </span>
        )
      }
    >
      {onReorder && <p className="text-xs text-muted-foreground">{t("mediaImageOrderHint")}</p>}
      <div
        role="region"
        aria-label={input ? t("mediaSelectedImagePreviews") : t("mediaGeneratedImagePreviews")}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
      >
        {onReorder ? (
          <OrderableList
            ariaLabel={t("mediaImageProcessingOrder")}
            className={gridClassName}
            layout="grid"
            disabled={disabled || files.length < 2}
            getId={(file) => (isArtifact(file) ? file.id : workspaceFileId(file))}
            getLabel={(file) => file.name}
            items={files}
            onReorder={onReorder}
            renderItem={(file, orderable) => (
              <div className="relative">
                {renderCard(file)}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        {...orderable.attributes}
                        {...orderable.listeners}
                        ref={orderable.setActivatorNodeRef}
                        disabled={orderable.disabled}
                        aria-label={t("reorderFile", { name: file.name })}
                        className="absolute left-4 top-4 cursor-grab touch-none active:cursor-grabbing"
                        size="icon-xs"
                        variant="secondary"
                      >
                        <GripVertical aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("mediaDragReorder")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          />
        ) : (
          <div className={gridClassName}>{files.map(renderCard)}</div>
        )}
      </div>
      {selected >= 0 && (
        <ImagePreviewDialog
          files={files}
          selected={selected}
          onSelect={(index) => setSelectedFile(files[index])}
          onClose={() => setSelectedFile(null)}
          onRemove={onRemove}
          disabled={disabled}
        />
      )}
    </WorkspaceSurface>
  );
}

export function MediaOutputGallery({
  files,
  header,
  disabled,
  primaryOutputId,
}: {
  files: readonly StoredToolArtifact[];
  header?: "visible" | "sr-only";
  disabled?: boolean;
  primaryOutputId?: string;
}) {
  return <ImageGallery files={files} header={header} disabled={disabled} primaryOutputId={primaryOutputId} />;
}

export function MediaInputGallery({
  files,
  onRemove,
  disabled,
  actions,
  onReorder,
}: {
  files: readonly File[];
  onRemove: (file: File) => void;
  disabled?: boolean;
  actions?: ReactNode;
  onReorder?: (files: File[]) => void;
}) {
  return <ImageGallery files={files} onRemove={onRemove} disabled={disabled} actions={actions} onReorder={onReorder} />;
}
