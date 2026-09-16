"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Crop, ExternalLink, EyeOff, CalendarX, RotateCw, Replace, Trash2 } from "lucide-react";
import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import {
  AlertBanner,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  Button,
  FileUploadZone,
  Input,
  Label,
  Popover,
  Textarea,
  toast,
  Toaster,
} from "@smarttools/ui";
import type { BlogDocument, BlogImage } from "@/lib/blog/document";
import { mutateBlogAction, uploadBlogImageAction } from "../actions";
import { BlogEditorShell } from "./BlogEditorShell";
import { BlogFormattingToolbar } from "./BlogFormattingToolbar";
import { BlogHistoryPanel } from "./BlogHistoryPanel";
import { BlogTableControls } from "./BlogTableControls";
import { BlogBlockControls } from "./BlogBlockControls";
import { BlogImageView } from "./BlogImageView";
import { BlogImageCropDialog } from "./BlogImageCropDialog";
import { BlogImageNode as BaseBlogImageNode, blogEditorImageSource as imageSource } from "../lib/imageNode";
import { blogFormattingExtensions } from "../lib/formattingExtensions";
import { pasteBlogImages } from "../lib/imagePaste";
import { BlogTableCell, BlogTableHeader } from "../lib/tableEditing";
import { BlogPostSettings } from "./BlogPostSettings";
import { BlogPublishPanel, type BlogScheduleValue } from "./BlogPublishPanel";
import { createDraftPersistence, type DraftSaveState } from "../lib/draftPersistence";
import { useBlogTaxonomyOptions, type TaxonomyOptions } from "../lib/useBlogTaxonomyOptions";
import styles from "./BlogEditor.module.css";

function bodyImages(node: JSONContent): JSONContent[] {
  return node.type === "image" ? [node] : (node.content ?? []).flatMap(bodyImages);
}

const BlogImageNode = BaseBlogImageNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlogImageView);
  },
});

type EditableDocument = Omit<BlogDocument, "body"> & { body: JSONContent };
const backupImage = z
  .object({
    publicId: z.string(),
    version: z.number(),
    format: z.enum(["jpg", "jpeg", "png", "webp"]),
    width: z.number(),
    height: z.number(),
    alt: z.string(),
    caption: z.string(),
  })
  .strict();
const backupTerm = z.object({ id: z.string(), label: z.string() }).strict();
const backupDocument = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string(),
    excerpt: z.string(),
    authorName: z.string(),
    body: z.custom<JSONContent>(
      (value) => !!value && typeof value === "object" && "type" in value && value.type === "doc",
    ),
    coverImage: backupImage.nullable(),
    category: backupTerm.nullable(),
    tags: z.array(backupTerm),
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable(),
    relatedToolIds: z.array(z.string()),
  })
  .strict();
interface Props {
  actorId: string;
  post: {
    id: string;
    slug: string;
    version: number;
    draftDocument: BlogDocument;
    trashedAt: Date | null;
    publishedRevisionId: string | null;
    schedule: { scheduledAt: Date; lastErrorCode: string | null } | null;
  };
  categories: TaxonomyOptions;
  tags: TaxonomyOptions;
  tools: { id: string; name: string }[];
  canEdit: boolean;
  canPublish: boolean;
  canCreate: boolean;
  cloudName: string;
}

export function BlogEditor({
  actorId,
  post,
  categories: initialCategories,
  tags: initialTags,
  tools,
  canEdit,
  canPublish,
  canCreate,
  cloudName,
}: Props) {
  const router = useRouter();
  const categoryOptions = useBlogTaxonomyOptions(
    "category",
    initialCategories,
    post.draftDocument.category ? [post.draftDocument.category] : [],
  );
  const tagOptions = useBlogTaxonomyOptions("tag", initialTags, post.draftDocument.tags);
  const categories = categoryOptions.items;
  const tags = tagOptions.items;
  const [document, setDocument] = useState<EditableDocument>(post.draftDocument);
  const current = useRef<EditableDocument>(post.draftDocument);
  const inFlight = useRef(false);
  const [saveState, setSaveState] = useState<DraftSaveState>("idle");
  const [backupUnavailable, setBackupUnavailable] = useState(false);
  const [status, setStatus] = useState(
    post.publishedRevisionId
      ? "Published · Editing a private draft"
      : post.schedule
        ? "Scheduled · Editing a private draft"
        : "Draft loaded · Changes save automatically",
  );
  const [persistence] = useState(() =>
    createDraftPersistence<EditableDocument>({
      document: post.draftDocument,
      version: post.version,
      request: async (input) => {
        const result = await mutateBlogAction("save", {
          postId: post.id,
          ...input,
        });
        if (result.ok && !("version" in result.data)) throw new Error("Unexpected save response");
        return result.ok
          ? {
              ok: true,
              data: { version: (result.data as { version: number }).version },
            }
          : result;
      },
      onState: (state, message) => {
        setSaveState(state);
        setStatus(message);
      },
      onBackupFailure: () => setBackupUnavailable(true),
    }),
  );
  useEffect(() => {
    persistence.start();
    return () => persistence.stop();
  }, [persistence]);
  const [review, setReview] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"post" | "seo">("post");
  const [returnSettingsOpen, setReturnSettingsOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [imageRequest, setImageRequest] = useState(0);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [schedule, setSchedule] = useState<BlogScheduleValue>({
    date: "",
    time: "09:00",
    timezone: "UTC",
  });
  const [publishError, setPublishError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publication, setPublication] = useState({
    published: !!post.publishedRevisionId,
    scheduled: !!post.schedule,
    scheduledAt: post.schedule?.scheduledAt ?? null,
    error: post.schedule?.lastErrorCode ?? null,
  });
  const [lifecycle, setLifecycle] = useState<"unpublish" | "cancelSchedule" | "retrySchedule" | null>(null);
  const [lifecycleError, setLifecycleError] = useState("");
  const [uploadTarget, setUploadTarget] = useState<"cover" | "body" | null>(null);
  const uploading = uploadTarget !== null;
  const uploadToastId = useId();
  const uploadActive = useRef(true);
  function showUploadError(message: string) {
    if (!uploadActive.current) return;
    if (message) toast.error(message, { id: uploadToastId, duration: 6000, closeButton: true });
    else toast.dismiss(uploadToastId);
  }
  useEffect(() => {
    uploadActive.current = true;
    return () => {
      uploadActive.current = false;
      toast.dismiss(uploadToastId);
    };
  }, [uploadToastId]);
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const coverSettings = useRef<HTMLDivElement>(null);
  const coverHovered = useRef(false);
  const coverOpenedByHover = useRef(false);
  const coverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelCoverClose() {
    if (coverCloseTimer.current) clearTimeout(coverCloseTimer.current);
    coverCloseTimer.current = null;
  }
  function scheduleCoverClose() {
    cancelCoverClose();
    coverCloseTimer.current = setTimeout(() => {
      coverCloseTimer.current = null;
      if (!coverHovered.current && !coverSettings.current?.contains(globalThis.document.activeElement))
        setCoverOpen(false);
    }, 250);
  }
  function openCoverSettings() {
    cancelCoverClose();
    coverOpenedByHover.current = false;
    setCoverOpen(true);
    if (coverOpen) globalThis.document.getElementById("blog-cover-alt")?.focus();
  }
  useEffect(
    () => () => {
      if (coverCloseTimer.current) clearTimeout(coverCloseTimer.current);
    },
    [],
  );
  const [coverCrop, setCoverCrop] = useState<BlogImage | null>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const allowUnload = useRef(false);
  const [recovery, setRecovery] = useState<{
    document: EditableDocument;
    version: number;
  } | null>(null);
  const hasUnsavedChanges = ["dirty", "saving", "error", "conflict"].includes(saveState) || uploading;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!allowUnload.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    function guardNavigation(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download"))
        return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(destination.pathname + destination.search + destination.hash);
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    globalThis.document.addEventListener("click", guardNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      globalThis.document.removeEventListener("click", guardNavigation, true);
    };
  }, [hasUnsavedChanges]);
  const editable = canEdit && !post.trashedAt;

  function change(next: EditableDocument) {
    current.current = next;
    setDocument(next);
    persistence.change(next);
  }

  const editor = useEditor({
    extensions: [
      ...blogFormattingExtensions,
      StarterKit.configure({
        heading: { levels: [2, 3, 4, 5, 6] },
        link: { openOnClick: false },
        dropcursor: { color: "var(--success)", width: 2 },
      }),
      TableKit.configure({ table: { resizable: true }, tableCell: false, tableHeader: false }),
      BlogTableCell,
      BlogTableHeader,
      BlogImageNode.configure({ cloudName, onUploadImage: uploadInlineImage }),
    ],
    content: post.draftDocument.body,
    immediatelyRender: false,
    editable,
    editorProps: {
      handlePaste: (_view, event): boolean =>
        editor ? pasteBlogImages(editor, event, uploadInlineImage, showUploadError) : false,
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Article body",
        class:
          "min-h-0 outline-none text-base leading-[1.6] [&_p]:my-4 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_a]:text-primary [&_a]:underline [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_img]:max-w-full [&_img]:h-auto",
      },
    },
    onUpdate: ({ editor: changed }) => change({ ...current.current, body: changed.getJSON() }),
  });
  useEffect(() => {
    editor?.setEditable(editable && !publishing && !recovery);
    if (!editable || publishing || recovery) setCoverCrop(null);
  }, [editor, editable, publishing, recovery]);
  useEffect(() => {
    if (review || !focusTarget || !editor) return;
    const frame = requestAnimationFrame(() => {
      if (focusTarget === "body" || focusTarget === "images") {
        editor.commands.focus();
        if (focusTarget === "images") {
          let selected = false;
          editor.state.doc.descendants((node, position) => {
            if (!selected && node.type.name === "image" && !String(node.attrs.alt ?? "").trim()) {
              selected = true;
              editor.commands.setNodeSelection(position);
            }
            return !selected;
          });
          if (selected) setImageRequest((request) => request + 1);
        }
      } else if (focusTarget === "cover") {
        globalThis.document.getElementById("blog-edit-cover")?.scrollIntoView({ block: "center" });
        openCoverSettings();
      } else globalThis.document.getElementById(focusTarget)?.focus();
      setFocusTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [review, focusTarget, editor]);
  useEffect(() => {
    if (!editable || !editor) return;
    try {
      const stored = persistence.attachStorage(window.sessionStorage, `blog-draft:${actorId}:${post.id}`);
      if (!stored) return;
      const parsed = backupDocument.safeParse(stored.document);
      if (!parsed.success) {
        persistence.forgetBackup();
        return;
      }
      editor.schema.nodeFromJSON(parsed.data.body).check();
      if (JSON.stringify(parsed.data) === JSON.stringify(post.draftDocument)) {
        persistence.forgetBackup();
        return;
      }
      setRecovery({ document: parsed.data, version: stored.version });
    } catch {
      setBackupUnavailable(true);
    }
  }, [actorId, editable, editor, persistence, post.id, post.draftDocument]);

  async function uploadImage(file: File, target: "cover" | "body"): Promise<BlogImage | null> {
    if (!editable || !uploadActive.current) return null;
    if (inFlight.current) {
      showUploadError("Another change is in progress. Wait for it to finish, then try the image again.");
      return null;
    }
    showUploadError("");
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showUploadError("Choose a JPEG, PNG or WebP image no larger than 5 MiB.");
      return null;
    }
    inFlight.current = true;
    setUploadTarget(target);
    try {
      const form = new FormData();
      form.set("file", file);
      const result = await uploadBlogImageAction(form);
      if (!uploadActive.current) return null;
      if (!result.ok) {
        showUploadError(result.message);
        return null;
      }
      return result.data;
    } catch {
      showUploadError("Couldn’t upload the image. Try a smaller image or try again.");
      return null;
    } finally {
      inFlight.current = false;
      if (uploadActive.current) setUploadTarget(null);
    }
  }
  async function uploadCover(file: File) {
    const image = await uploadImage(file, "cover");
    if (image && uploadActive.current) {
      change({ ...current.current, coverImage: image });
      openCoverSettings();
    }
  }
  async function uploadInlineImage(file: File) {
    return uploadImage(file, "body");
  }

  async function applyCoverCrop(file: File) {
    function currentCover() {
      const cover = current.current.coverImage;
      if (
        !coverCrop ||
        !uploadActive.current ||
        !editor?.isEditable ||
        cover?.publicId !== coverCrop.publicId ||
        cover?.version !== coverCrop.version
      ) {
        throw new Error("The cover changed or editing is unavailable. Cancel and reopen Crop cover.");
      }
      return cover;
    }
    currentCover();
    const image = await uploadImage(file, "cover");
    if (!image) throw new Error("Couldn’t upload the crop. Your current cover is unchanged. Try again.");
    const cover = currentCover();
    change({
      ...current.current,
      coverImage: { ...image, alt: cover.alt, caption: cover.caption },
    });
    toast.success("Cover cropped. Changes save automatically.");
  }

  function closeCoverCrop() {
    setCoverCrop(null);
    globalThis.requestAnimationFrame?.(() => {
      globalThis.document?.getElementById(current.current.coverImage ? "blog-edit-cover" : "blog-add-cover")?.focus();
    });
  }

  async function save() {
    return editable && !inFlight.current ? persistence.save() : false;
  }

  async function openPreview() {
    if (saveState === "conflict" || inFlight.current) return;
    if (editable && (persistence.dirty || saveState === "saving" || saveState === "error")) {
      if (!(await save())) return;
    }
    router.refresh();
    router.push(`/admin/blog/${post.id}/preview`);
  }

  async function openReview() {
    if (saveState === "conflict" || inFlight.current) return;
    setSettingsTab("post");
    setReturnSettingsOpen(false);
    if (editable && (persistence.dirty || saveState === "saving" || saveState === "error")) {
      if (!(await save())) return;
    }
    setReview(true);
  }

  async function updatePublication() {
    if (!lifecycle || inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setLifecycleError("");
    try {
      if (editable && !(await persistence.save())) {
        setLifecycleError("Save or recover your draft before changing publication.");
        return;
      }
      const result = await mutateBlogAction(lifecycle, {
        postId: post.id,
        version: persistence.version,
      });
      if (!result.ok) {
        if (result.code === "CONFLICT") persistence.markConflict(result.message);
        setLifecycleError(result.message);
        return;
      }
      if (!("version" in result.data)) throw new Error("Unexpected publication response");
      persistence.version = result.data.version;
      setPublication({
        published: lifecycle === "retrySchedule" || (lifecycle !== "unpublish" && publication.published),
        scheduled: false,
        scheduledAt: null,
        error: null,
      });
      setStatus(
        `${lifecycle === "unpublish" ? "Unpublished" : lifecycle === "retrySchedule" ? "Scheduled revision published" : "Schedule cancelled"} · Draft preserved`,
      );
      setLifecycle(null);
    } catch {
      setLifecycleError("The request failed. Try again.");
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  }

  async function publish() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setPublishError("");
    try {
      if (editable && !(await persistence.save())) {
        setPublishError("Save or recover your draft before publishing.");
        return;
      }
      const input = { postId: post.id, version: persistence.version };
      const result =
        mode === "schedule"
          ? await mutateBlogAction("schedule", {
              ...input,
              scheduledAt: new Date(`${schedule.date}T${schedule.time}:00Z`).toISOString(),
            })
          : await mutateBlogAction("publish", input);
      if (!result.ok) {
        if (result.code === "CONFLICT") persistence.markConflict(result.message);
        setPublishError(result.message);
        return;
      }
      if (!("version" in result.data)) throw new Error("Unexpected publication response");
      persistence.version = result.data.version;
      setPublication(
        mode === "schedule"
          ? {
              ...publication,
              scheduled: true,
              scheduledAt: new Date(`${schedule.date}T${schedule.time}:00Z`),
              error: null,
            }
          : {
              published: true,
              scheduled: false,
              scheduledAt: null,
              error: null,
            },
      );
      setReview(false);
      setSaveState("saved");
      setStatus(
        mode === "schedule"
          ? `Scheduled · ${schedule.date} ${schedule.time} UTC`
          : "Published · Saved revision is live",
      );
    } catch {
      setPublishError("The request failed. Check the date and time, then try again.");
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  }

  async function duplicate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setLifecycleError("");
    try {
      if (editable && !(await persistence.save())) return;
      const result = await mutateBlogAction("duplicate", { postId: post.id });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      router.push(`/admin/blog/${result.data.id}`);
    } catch {
      setLifecycleError("Couldn’t duplicate this post. Try again.");
    } finally {
      inFlight.current = false;
      setPublishing(false);
    }
  }

  function downloadDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.current, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = `${post.slug}-draft.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fixPublishCheck(id: string) {
    const fields: Record<string, string> = {
      title: "blog-title",
      excerpt: "blog-excerpt",
      author: "blog-author",
      category: "blog-post-category",
    };
    setSettingsTab("post");
    setReturnSettingsOpen(["excerpt", "author", "category"].includes(id));
    setFocusTarget(fields[id] ?? id);
    setReview(false);
  }

  if (review)
    return (
      <div className={styles.review} data-schedule={mode === "schedule"}>
        <header className={styles.reviewHeader}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (mode === "schedule" ? setMode("now") : setReview(false))}
            disabled={publishing}
          >
            <ArrowLeft aria-hidden="true" />
            {mode === "schedule" ? "Back to review" : "Back to editor"}
          </Button>
          <h1 className={styles.title}>{document.title}</h1>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void openPreview();
            }}
            disabled={publishing}
          >
            Preview
          </Button>
        </header>
        <div className={styles.reviewWorkspace}>
          <div className={styles.recap}>
            <p className={`${styles.recapLabel} text-xs text-muted-foreground`}>
              {mode === "schedule" ? "POST TO SCHEDULE" : "YOUR POST"}
            </p>
            <h2 className={styles.recapTitle}>{document.title}</h2>
            <p className={styles.recapExcerpt}>{document.excerpt}</p>
            {document.coverImage && (
              <img
                src={imageSource(document.coverImage, cloudName)}
                alt={document.coverImage.alt}
                width={document.coverImage.width}
                height={document.coverImage.height}
                className={styles.recapCover}
              />
            )}
            <p className="text-[13px] text-muted-foreground">
              {document.authorName} · {document.category?.label ?? "No category"}
            </p>
            <p className={`${styles.recapLabel} text-xs text-muted-foreground`}>PUBLIC URL</p>
            <p className="break-all text-base text-primary">/blog/{post.slug}</p>
          </div>
          <BlogPublishPanel
            minimumDate={new Date().toISOString().slice(0, 10)}
            hasLiveVersion={publication.published}
            mode={mode}
            onModeChange={setMode}
            schedule={schedule}
            onScheduleChange={setSchedule}
            timezones={["UTC"]}
            checks={[
              {
                id: "title",
                label: "Article title",
                valid: !!document.title.trim(),
              },
              {
                id: "excerpt",
                label: "Article excerpt",
                valid: !!document.excerpt.trim(),
              },
              {
                id: "body",
                label: "Article body",
                valid:
                  !!editor?.getText().trim() ||
                  bodyImages(document.body).some((node) => !!String(node.attrs?.alt ?? "").trim()),
              },
              {
                id: "author",
                label: "Public byline",
                valid: !!document.authorName.trim(),
              },
              {
                id: "category",
                label: "Category selected",
                valid: !!document.category,
              },
              {
                id: "cover",
                label: "Cover description",
                valid: !document.coverImage || !!document.coverImage.alt.trim(),
              },
              {
                id: "images",
                label: "Inline image descriptions",
                valid: bodyImages(document.body).every((node) => !!String(node.attrs?.alt ?? "").trim()),
              },
            ]}
            searchPreview={{
              title: document.seoTitle || document.title,
              description: document.seoDescription || document.excerpt,
              url: `/blog/${post.slug}`,
            }}
            onFixCheck={fixPublishCheck}
            onEditSeo={() => {
              setSettingsTab("seo");
              setReturnSettingsOpen(true);
              setFocusTarget("blog-seo-title");
              setReview(false);
            }}
            onBack={() => setReview(false)}
            onSubmit={() => {
              void publish();
            }}
            canPublish={canPublish}
            pending={publishing}
            error={publishError}
          />
        </div>
      </div>
    );

  const coverPreview = document.coverImage && (
    <img
      src={imageSource(document.coverImage, cloudName)}
      alt={document.coverImage.alt}
      width={document.coverImage.width}
      height={document.coverImage.height}
      className={styles.cover}
    />
  );

  return (
    <BlogEditorShell
      initialSettingsOpen={returnSettingsOpen}
      title={document.title}
      status={status}
      saveState={saveState}
      busy={publishing || uploading || !!recovery}
      canEdit={editable}
      canPublish={canPublish && !post.trashedAt}
      onSave={() => {
        void save();
      }}
      onPreview={() => {
        void openPreview();
      }}
      onReview={() => {
        void openReview();
      }}
      publicationActions={
        <>
          {publication.published && (
            <Button asChild variant="ghost" size="xs">
              <Link href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                View live
              </Link>
            </Button>
          )}
          {canCreate && !post.trashedAt && (
            <Button
              variant="ghost"
              size="xs"
              disabled={publishing || uploading || !!recovery || saveState === "conflict"}
              onClick={() => {
                void duplicate();
              }}
            >
              <Copy aria-hidden="true" />
              Duplicate
            </Button>
          )}
          {canPublish && publication.published && (
            <Button
              variant="ghost"
              size="xs"
              disabled={publishing || uploading || !!recovery}
              onClick={() => {
                setLifecycleError("");
                setLifecycle("unpublish");
              }}
            >
              <EyeOff aria-hidden="true" />
              Unpublish
            </Button>
          )}
          {canPublish && publication.scheduled && (
            <Button
              variant="ghost"
              size="xs"
              disabled={publishing || uploading || !!recovery}
              onClick={() => {
                setLifecycleError("");
                setLifecycle("cancelSchedule");
              }}
            >
              <CalendarX aria-hidden="true" />
              Cancel schedule
            </Button>
          )}
          {canPublish && publication.error && (
            <Button
              variant="ghost"
              size="xs"
              disabled={publishing || uploading || !!recovery}
              onClick={() => {
                setLifecycleError("");
                setLifecycle("retrySchedule");
              }}
            >
              <RotateCw aria-hidden="true" />
              Retry scheduled publication
            </Button>
          )}
        </>
      }
      history={
        <BlogHistoryPanel
          currentTitle={document.title}
          postId={post.id}
          version={persistence.version}
          publishedRevisionId={post.publishedRevisionId}
        />
      }
      toolbar={
        <BlogFormattingToolbar
          editor={editor}
          disabled={!editable || publishing || !!recovery}
          onUploadImage={uploadInlineImage}
          imageRequest={imageRequest}
          onImageRequestHandled={() => setImageRequest(0)}
        />
      }
      settings={
        <BlogPostSettings
          defaultTab={settingsTab}
          categories={categories}
          tags={tags}
          tools={tools}
          slug={post.slug}
          disabled={!editable || publishing || !!recovery}
          taxonomyHref={`/admin/blog/taxonomy?${new URLSearchParams({ returnTo: `/admin/blog/${post.id}` })}`}
          categoryPagination={
            <>
              {categoryOptions.hasMore && (
                <Button
                  size="xs"
                  variant="ghost"
                  loading={categoryOptions.loading}
                  onClick={() => {
                    void categoryOptions.loadMore();
                  }}
                >
                  Load more categories
                </Button>
              )}
              {categoryOptions.error && (
                <p role="alert" className="text-xs text-destructive">
                  {categoryOptions.error}
                </p>
              )}
            </>
          }
          tagPagination={
            <>
              {tagOptions.hasMore && (
                <Button
                  size="xs"
                  variant="ghost"
                  loading={tagOptions.loading}
                  onClick={() => {
                    void tagOptions.loadMore();
                  }}
                >
                  Load more tags
                </Button>
              )}
              {tagOptions.error && (
                <p role="alert" className="text-xs text-destructive">
                  {tagOptions.error}
                </p>
              )}
            </>
          }
          value={{
            authorName: document.authorName,
            categoryId: document.category?.id ?? "",
            tagIds: document.tags.map((tag) => tag.id),
            excerpt: document.excerpt,
            seoTitle: document.seoTitle ?? "",
            seoDescription: document.seoDescription ?? "",
            relatedToolIds: document.relatedToolIds,
          }}
          onChange={(value) =>
            change({
              ...current.current,
              authorName: value.authorName,
              excerpt: value.excerpt,
              category:
                value.categoryId === current.current.category?.id
                  ? current.current.category
                  : categories.find((item) => item.id === value.categoryId)
                    ? {
                        id: value.categoryId,
                        label: categories.find((item) => item.id === value.categoryId)!.name,
                      }
                    : null,
              tags: value.tagIds.flatMap((id) => {
                const term = tags.find((tag) => tag.id === id);
                const existing = current.current.tags.find((tag) => tag.id === id);
                return term ? [{ id, label: term.name }] : existing ? [existing] : [];
              }),
              seoTitle: value.seoTitle || null,
              seoDescription: value.seoDescription || null,
              relatedToolIds: value.relatedToolIds,
            })
          }
        />
      }
    >
      {recovery && (
        <AlertBanner title="Recover unsaved edits?">
          This tab has a local draft from before you left.{" "}
          {recovery.version !== post.version
            ? "The saved article has changed; recovering keeps your local copy separate until you reload."
            : "Restore it to continue writing."}
          <div className="mt-3 flex gap-2">
            <Button
              size="xs"
              onClick={() => {
                editor?.commands.setContent(recovery.document.body, {
                  emitUpdate: false,
                });
                current.current = recovery.document;
                setDocument(recovery.document);
                persistence.restore(recovery.document, recovery.version);
                setRecovery(null);
              }}
            >
              Recover local draft
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                persistence.forgetBackup();
                setRecovery(null);
              }}
            >
              Keep saved draft
            </Button>
          </div>
        </AlertBanner>
      )}
      {(saveState === "conflict" || saveState === "error") && (
        <AlertBanner
          variant="error"
          title={saveState === "conflict" ? "Another version was saved" : "Draft could not be saved"}
        >
          Your local edits are preserved. Download a backup before leaving or reloading.
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="xs" variant="outline" onClick={downloadDraft}>
              Download local draft
            </Button>
            {saveState === "conflict" ? (
              <Button size="xs" variant="outline" onClick={() => setLeaveHref(`/admin/blog/${post.id}`)}>
                Reload saved version
              </Button>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  void save();
                }}
              >
                Retry save
              </Button>
            )}
          </div>
        </AlertBanner>
      )}
      {lifecycleError && !lifecycle && <AlertBanner variant="error">{lifecycleError}</AlertBanner>}
      {backupUnavailable && (
        <AlertBanner variant="warning">
          This browser couldn’t keep a local recovery copy. Wait for “All changes saved” before leaving the editor.
        </AlertBanner>
      )}
      {publication.scheduled && (
        <AlertBanner
          variant={publication.error ? "warning" : "info"}
          title={publication.error ? "Scheduled publication needs attention" : "A saved revision is scheduled"}
        >
          {publication.scheduledAt &&
            `${new Date(publication.scheduledAt).toISOString().slice(0, 16).replace("T", " ")} UTC. `}
          {publication.error
            ? "The last attempt failed. Retry the scheduled revision or review and schedule your current draft again."
            : "Later draft edits do not change this version. Use Review & publish to replace its schedule."}
        </AlertBanner>
      )}
      {post.trashedAt && (
        <AlertBanner title="This post is in trash">Restore it from the post list before editing.</AlertBanner>
      )}
      <Label htmlFor="blog-title" className="text-xs text-muted-foreground">
        TITLE
      </Label>
      <Textarea
        id="blog-title"
        placeholder="Give your story a title…"
        rows={1}
        value={document.title}
        maxLength={200}
        disabled={!editable || publishing || !!recovery}
        className={styles.postTitle}
        onChange={(event) => change({ ...current.current, title: event.target.value })}
      />
      <Textarea
        aria-label="Article summary"
        rows={1}
        maxLength={500}
        placeholder="Add a short summary that helps readers decide to read."
        value={document.excerpt}
        disabled={!editable || publishing || !!recovery}
        className={styles.excerpt}
        onChange={(event) => change({ ...current.current, excerpt: event.target.value })}
      />
      <div className="my-[22px] space-y-3">
        {document.coverImage && (
          <Popover.Root
            open={editable && !publishing && !recovery && coverOpen}
            onOpenChange={(open) => {
              cancelCoverClose();
              setCoverOpen(open);
            }}
          >
            <div>
              {editable ? (
                <Popover.Trigger asChild>
                  <Button
                    id="blog-edit-cover"
                    variant="ghost"
                    className="block h-auto w-full rounded-lg p-0 disabled:opacity-100"
                    aria-label="Edit cover image"
                    disabled={uploading || publishing || !!recovery}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "touch" || uploading || publishing || recovery) return;
                      coverHovered.current = true;
                      cancelCoverClose();
                      if (!coverOpen) {
                        coverOpenedByHover.current = true;
                        setCoverOpen(true);
                      }
                    }}
                    onPointerLeave={() => {
                      coverHovered.current = false;
                      scheduleCoverClose();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      openCoverSettings();
                    }}
                  >
                    {coverPreview}
                  </Button>
                </Popover.Trigger>
              ) : (
                coverPreview
              )}
              {editable && !document.coverImage.alt.trim() && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-2 font-normal text-destructive [@media(pointer:coarse)]:min-h-11"
                  disabled={uploading || publishing || !!recovery}
                  onClick={openCoverSettings}
                >
                  Alt text missing
                </Button>
              )}
            </div>
            <Popover.Portal>
              <Popover.Content
                ref={coverSettings}
                className="z-[70] w-80 max-w-[var(--radix-popover-content-available-width)] rounded-xl border border-border bg-card text-foreground shadow-lg [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_input]:min-h-11"
                side="bottom"
                align="center"
                sideOffset={4}
                collisionPadding={12}
                aria-label="Cover image settings"
                onPointerEnter={() => {
                  coverHovered.current = true;
                  cancelCoverClose();
                }}
                onPointerLeave={() => {
                  coverHovered.current = false;
                  scheduleCoverClose();
                }}
                onFocusCapture={() => {
                  coverOpenedByHover.current = false;
                  cancelCoverClose();
                }}
                onBlurCapture={scheduleCoverClose}
                onOpenAutoFocus={(event) => {
                  if (coverOpenedByHover.current) event.preventDefault();
                }}
                onCloseAutoFocus={(event) => {
                  if (!current.current.coverImage) {
                    event.preventDefault();
                    globalThis.document.getElementById("blog-add-cover")?.focus();
                  } else if (coverOpenedByHover.current) event.preventDefault();
                }}
              >
                <div className="max-h-[calc(var(--radix-popover-content-available-height)-2px)] space-y-3 overflow-y-auto overscroll-contain p-4">
                  <div className="space-y-1">
                    <Label htmlFor="blog-cover-alt">Alt text</Label>
                    <Input
                      id="blog-cover-alt"
                      size="sm"
                      maxLength={500}
                      aria-required="true"
                      aria-describedby="blog-cover-alt-help"
                      value={document.coverImage.alt}
                      disabled={uploading || publishing || !!recovery}
                      placeholder="Describe what the image shows"
                      onChange={(event) => {
                        const cover = current.current.coverImage;
                        if (cover)
                          change({
                            ...current.current,
                            coverImage: { ...cover, alt: event.target.value },
                          });
                      }}
                    />
                    <p id="blog-cover-alt-help" className="text-xs text-muted-foreground">
                      Describe the image for screen readers. Required before publishing; saves with your draft.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading || publishing || !!recovery}
                      onClick={() => {
                        setCoverCrop(current.current.coverImage);
                        setCoverOpen(false);
                      }}
                    >
                      <Crop aria-hidden="true" />
                      Crop cover
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={uploadTarget === "cover"}
                      disabled={uploading || publishing || !!recovery}
                      onClick={() => coverInput.current?.click()}
                    >
                      <Replace aria-hidden="true" />
                      Replace cover
                    </Button>
                    <Button
                      variant="danger-subtle"
                      size="sm"
                      disabled={uploading || publishing || !!recovery}
                      onClick={() => {
                        setCoverOpen(false);
                        change({ ...current.current, coverImage: null });
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove cover
                    </Button>
                  </div>
                </div>
                <Popover.Arrow className="fill-card stroke-border" width={12} height={6} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {editable && !document.coverImage && (
          <FileUploadZone
            id="blog-add-cover"
            className="min-h-[160px]"
            title="Add a cover image"
            description="JPG · PNG · WebP · Up to 5 MiB"
            hint="Browse files. Uploads are stored for publication."
            disabled={uploading || publishing || !!recovery}
            onClick={() => coverInput.current?.click()}
          />
        )}
        {editable && (
          <>
            <input
              ref={coverInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label="Cover image file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadCover(file);
              }}
            />
            {uploadTarget === "cover" && (
              <span role="status" className="text-[13px] text-muted-foreground">
                Uploading cover…
              </span>
            )}
          </>
        )}
      </div>
      {coverCrop && editable && !publishing && !recovery && (
        <BlogImageCropDialog
          src={imageSource(coverCrop, cloudName)}
          format={coverCrop.format}
          title="Crop cover"
          isCover
          onApply={applyCoverCrop}
          onClose={closeCoverCrop}
        />
      )}
      <Toaster position="top-right" />
      {uploadTarget === "body" && (
        <p role="status" className="mb-2 text-[13px] text-muted-foreground">
          Uploading article image…
        </p>
      )}
      <EditorContent className={styles.editorBody} editor={editor} />
      <BlogBlockControls
        editor={editor}
        disabled={!editable || publishing || !!recovery}
        onUploadImage={uploadInlineImage}
      />
      <BlogTableControls editor={editor} disabled={!editable || publishing || uploading || !!recovery} />
      <AlertDialog
        open={lifecycle !== null}
        onOpenChange={(open) => {
          if (!open && !publishing) setLifecycle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lifecycle === "unpublish"
                ? "Unpublish this post?"
                : lifecycle === "retrySchedule"
                  ? "Retry scheduled publication?"
                  : "Cancel scheduled publication?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lifecycle === "unpublish"
                ? "This removes the public article and cancels its schedule. Your draft and history are preserved."
                : lifecycle === "retrySchedule"
                  ? "Publish the saved scheduled revision now. Later draft changes are not included."
                  : "The scheduled version won’t publish. Any currently live article stays public, and your draft is preserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lifecycleError && <AlertBanner variant="error">{lifecycleError}</AlertBanner>}
          <AlertDialogFooter>
            <AlertDialogCancel size="sm" disabled={publishing}>
              Keep current state
            </AlertDialogCancel>
            <Button
              size="sm"
              variant={lifecycle === "retrySchedule" ? "default" : "destructive"}
              loading={publishing}
              onClick={() => {
                void updatePublication();
              }}
            >
              {lifecycle === "unpublish"
                ? "Unpublish"
                : lifecycle === "retrySchedule"
                  ? "Retry publication"
                  : "Cancel schedule"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={leaveHref !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your latest edits will be lost. Stay here and save your draft before leaving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Keep editing</AlertDialogCancel>
            <Button size="sm" variant="outline" onClick={downloadDraft}>
              Download local draft
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={saveState === "saving" || uploading}
              onClick={() => {
                persistence.stop();
                persistence.forgetBackup();
                allowUnload.current = true;
                if (leaveHref === `/admin/blog/${post.id}`) window.location.reload();
                else if (leaveHref) router.push(leaveHref);
                setLeaveHref(null);
              }}
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BlogEditorShell>
  );
}
