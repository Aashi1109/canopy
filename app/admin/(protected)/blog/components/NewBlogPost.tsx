"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Label, Textarea, toast, Toaster } from "@/components/ui/index.tsx";
import { BLOG_TITLE_WORD_LIMIT, blogTitleWordCount } from "@/lib/blog/title";
import { mutateBlogAction } from "../actions";
import styles from "./BlogEditor.module.css";

export function NewBlogPost() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const creating = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const wordCount = blogTitleWordCount(title);
  const titleTooLong = wordCount > BLOG_TITLE_WORD_LIMIT;
  async function create() {
    if (creating.current) return;
    if (titleTooLong) {
      toast.error(`Use ${BLOG_TITLE_WORD_LIMIT} words or fewer for your title.`);
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a title to start your draft.");
      return;
    }
    creating.current = true;
    setPending(true);
    try {
      const result = await mutateBlogAction("create", { title: title.trim() });
      if (!active.current) return;
      if (result.ok) {
        router.push(`/admin/blog/${result.data.id}`);
        return;
      }
      toast.error(result.message);
    } catch {
      if (active.current)
        toast.error("Couldn’t create your draft. Your title is still here; press Enter to try again.");
    }
    creating.current = false;
    setPending(false);
  }
  return (
    <section className={styles.shell} aria-label="New blog post">
      <Toaster position="top-right" />
      <header className={styles.header}>
        <Button asChild variant="ghost">
          <Link href="/admin/blog">← Posts</Link>
        </Button>
        <h1 className={styles.title}>{title || "Untitled post"}</h1>
      </header>
      <div className={styles.scroll}>
        <form
          id="new-blog-post"
          noValidate
          className={styles.article}
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Label htmlFor="new-blog-title" className="text-xs font-normal text-muted-foreground/90">
            TITLE
          </Label>
          <Textarea
            id="new-blog-title"
            className={styles.postTitle}
            rows={1}
            autoFocus
            required
            maxLength={200}
            enterKeyHint="go"
            aria-describedby="new-blog-title-help new-blog-title-count"
            aria-invalid={titleTooLong}
            value={title}
            readOnly={pending}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              event.preventDefault();
              if (!event.repeat) event.currentTarget.form?.requestSubmit();
            }}
            placeholder="Give your story a title…"
          />
          <p
            id="new-blog-title-count"
            role={titleTooLong ? "alert" : undefined}
            className={`mt-2 text-xs ${titleTooLong ? "text-destructive" : "text-muted-foreground"}`}
          >
            {wordCount}/{BLOG_TITLE_WORD_LIMIT} words{titleTooLong ? " · Shorten your title to continue." : ""}
          </p>
          <p id="new-blog-title-help" className="mt-[22px] text-[19px] leading-relaxed text-muted-foreground">
            Press Enter to create your private draft and start writing.
          </p>
        </form>
      </div>
      <footer className={styles.footer}>
        <p role="status" className="text-muted-foreground">
          {pending ? "Creating private draft…" : "New post · Not saved yet"}
        </p>
        <span className="text-muted-foreground">Only admins can see drafts</span>
      </footer>
    </section>
  );
}
