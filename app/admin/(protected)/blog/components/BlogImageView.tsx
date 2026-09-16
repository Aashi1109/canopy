"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlignCenter, AlignLeft, AlignRight, Replace, Trash2 } from "lucide-react";
import { Button, Input, Label, Popover, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@smarttools/ui";
import type { BlogImage } from "@/lib/blog/document";
import { blogEditorImageSource } from "../lib/imageNode.ts";
import styles from "./BlogImageView.module.css";

export function resizedImageWidth(width: number, deltaX: number, containerWidth: number, alignment: string) {
  if (containerWidth <= 0) return width;
  const direction = alignment === "right" ? -1 : alignment === "center" ? 2 : 1;
  return Math.max(10, Math.min(100, Math.round(width + deltaX * direction / containerWidth * 100)));
}

export function BlogImageView({ node, editor, extension, selected, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const settings = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const drag = useRef<{ pointerId: number; x: number; width: number; containerWidth: number; latest: number } | null>(null);
  const [editable, setEditable] = useState(editor.isEditable);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [settingsDismissed, setSettingsDismissed] = useState(false);
  const settingsOpen = selected && editable && !settingsDismissed;
  const width = Number(node.attrs.displayWidth ?? 100);
  const alignment = String(node.attrs.alignment ?? "center");
  const visibleWidth = previewWidth ?? width;
  const imageEdge = alignment === "center" ? (100 + visibleWidth) / 2 : visibleWidth;
  const settingsSide = containerWidth * (100 - imageEdge) / 100 >= 296
    ? alignment === "right" ? "left" : "right"
    : "below";
  const [widthText, setWidthText] = useState(String(width));
  const options = extension.options as { cloudName: string; onUploadImage: (file: File) => Promise<BlogImage | null> };

  useEffect(() => { setWidthText(String(width)); }, [width]);
  useEffect(() => { if (!selected) setSettingsDismissed(false); }, [selected]);
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    setContainerWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const syncEditable = () => {
      setEditable(editor.isEditable);
      if (!editor.isEditable) { drag.current = null; setPreviewWidth(null); }
    };
    editor.on("update", syncEditable);
    return () => { mounted.current = false; drag.current = null; editor.off("update", syncEditable); };
  }, [editor]);

  function selectImage(focus = false) {
    const position = getPos();
    if (typeof position !== "number" || editor.isDestroyed) return;
    setSettingsDismissed(false);
    editor.commands.setNodeSelection(position);
    if (focus) editor.view.focus();
  }
  function change(attributes: Record<string, string | number>) {
    if (editor.isEditable && typeof getPos() === "number") updateAttributes(attributes);
  }
  function commitWidth() {
    const value = Number(widthText);
    const next = widthText.trim() && Number.isFinite(value) ? Math.max(10, Math.min(100, Math.round(value))) : width;
    setWidthText(String(next));
    change({ displayWidth: next });
  }
  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!editor.isEditable || event.button !== 0 || !wrapper.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, width, containerWidth: wrapper.current.getBoundingClientRect().width, latest: width };
  }
  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !editor.isEditable) return;
    current.latest = resizedImageWidth(current.width, event.clientX - current.x, current.containerWidth, alignment);
    setPreviewWidth(current.latest);
  }
  function finishResize(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreviewWidth(null);
    if (!cancel) change({ displayWidth: current.latest });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function replaceImage(file: File) {
    if (!editor.isEditable || pending) return;
    setPending(true);
    setMessage("");
    const sourceId = node.attrs.publicId;
    const sourceVersion = node.attrs.version;
    try {
      const image = await options.onUploadImage(file);
      if (!mounted.current || editor.isDestroyed) return;
      if (!image) { setMessage("Image could not be replaced. Your current image is unchanged; choose the file to retry."); return; }
      const position = getPos();
      const current = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
      if (!editor.isEditable || current?.type.name !== "image" || current.attrs.publicId !== sourceId || current.attrs.version !== sourceVersion) {
        setMessage("The image changed during upload. Select the image and try replacing it again.");
        return;
      }
      updateAttributes({ ...image, alt: current.attrs.alt, caption: current.attrs.caption });
      setMessage("Image replaced. Undo is available in the editor toolbar.");
    } catch {
      if (mounted.current) setMessage("Image could not be replaced. Your current image is unchanged; choose the file to retry.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  const image = <img src={blogEditorImageSource({ publicId: String(node.attrs.publicId), version: Number(node.attrs.version), format: String(node.attrs.format) }, options.cloudName)} alt={String(node.attrs.alt ?? "")} width={Number(node.attrs.width)} height={Number(node.attrs.height)} draggable={editable} data-drag-handle={editable ? "" : undefined} onDragStart={() => setSettingsDismissed(true)} />;
  return <NodeViewWrapper ref={wrapper} className={styles.wrapper} contentEditable={false} data-selected={selected}>
    <Popover.Root open={settingsOpen} onOpenChange={open => setSettingsDismissed(!open)}>
    <Popover.Anchor asChild><figure className={styles.figure} data-alignment={alignment} style={{ width: `${previewWidth ?? width}%` }}>
      <div className={styles.picture}>
        {editable ? <Button variant="ghost" className={styles.imageButton} aria-label={`Edit image: ${String(node.attrs.alt || "Add an image description")}`} aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsOpen ? `${id}-settings` : undefined} onClick={() => selectImage(true)} onFocus={() => selectImage()} onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); settings.current?.focus(); }
          if ((event.metaKey || event.ctrlKey) && ["c", "x", "v"].includes(event.key.toLowerCase())) {
            // Clipboard defaults run before Tiptap's deferred focus command.
            selectImage(true);
          }
        }}>{image}</Button> : image}
        {selected && editable && <Button variant="ghost" size="icon-xs" className={styles.resize} data-alignment={alignment} role="slider" aria-label="Image width" aria-valuemin={10} aria-valuemax={100} aria-valuenow={previewWidth ?? width} aria-valuetext={`${previewWidth ?? width}% wide`} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={event => finishResize(event)} onPointerCancel={event => finishResize(event, true)} onLostPointerCapture={event => finishResize(event, true)} onKeyDown={event => {
          if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const next = event.key === "Home" ? 10 : event.key === "End" ? 100 : Math.max(10, Math.min(100, width + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 10 : 1)));
            change({ displayWidth: next });
          }
        }}><span aria-hidden="true" /></Button>}
      </div>
      {node.attrs.caption && <figcaption className={styles.caption}>{String(node.attrs.caption)}</figcaption>}
    </figure></Popover.Anchor>
    <Popover.Portal><Popover.Content ref={settings} id={`${id}-settings`} tabIndex={-1} className={styles.controls} aria-label="Image settings" side={settingsSide === "below" ? "bottom" : settingsSide} align="start" sideOffset={16} collisionPadding={12} onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} onEscapeKeyDown={() => { if (!editor.isDestroyed) editor.view.focus(); }} onInteractOutside={event => {
      if (event.target instanceof Node && (wrapper.current?.contains(event.target) || event.target === editor.view.dom)) event.preventDefault();
    }}><TooltipProvider>
        <div className={styles.actions}>
          <div className={styles.alignment} role="group" aria-label="Image alignment">
            {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => <Tooltip key={value}><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Align image ${value}`} aria-pressed={alignment === value} onClick={() => change({ alignment: value })}><Icon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>Align {value}</TooltipContent></Tooltip>)}
          </div>
          <div className={styles.width}><Label htmlFor={`${id}-width`}>Width</Label><Input id={`${id}-width`} type="number" size="sm" min={10} max={100} step={1} value={widthText} suffix="%" onChange={event => setWidthText(event.target.value)} onBlur={commitWidth} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitWidth(); } }} /></div>
          <Button size="sm" variant="outline" loading={pending} onClick={() => fileInput.current?.click()}><Replace aria-hidden="true" />Replace</Button>
          <Tooltip><TooltipTrigger asChild><Button variant="danger-subtle" size="icon-sm" aria-label="Remove image" onClick={() => { if (editor.isEditable) { deleteNode(); editor.commands.focus(); } }}><Trash2 aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>Remove image (undo available)</TooltipContent></Tooltip>
          <input ref={fileInput} className={styles.fileInput} tabIndex={-1} aria-label="Replacement image file" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void replaceImage(file); }} />
        </div>
        <div className={styles.fields}>
          <div><Label htmlFor={`${id}-alt`}>Alt text</Label><Input id={`${id}-alt`} size="sm" value={String(node.attrs.alt ?? "")} maxLength={500} placeholder="Describe the image for screen readers" onChange={event => change({ alt: event.target.value })} /></div>
          <div><Label htmlFor={`${id}-caption`}>Caption (optional)</Label><Input id={`${id}-caption`} size="sm" value={String(node.attrs.caption ?? "")} maxLength={1000} placeholder="Caption shown below the image" onChange={event => change({ caption: event.target.value })} /></div>
        </div>
        <p className={styles.hint}>Drag the image to move it. Drag the corner to resize, or enter a width from 10–100%. Aspect ratio is preserved.</p>
        {message && <p className={styles.message} role="status">{message}</p>}
    </TooltipProvider></Popover.Content></Popover.Portal>
    </Popover.Root>
  </NodeViewWrapper>;
}
