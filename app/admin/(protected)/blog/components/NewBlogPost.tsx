"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertBanner, Button, Label, Textarea } from "@/components/ui/index.tsx";
import { mutateBlogAction } from "../actions";
import styles from "./BlogEditor.module.css";

export function NewBlogPost() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    if (pending || !title.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await mutateBlogAction("create", { title: title.trim() });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/admin/blog/${result.data.id}`);
    } catch {
      setError("Couldn’t create your draft. Your title is still here; try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className={styles.shell} aria-label="New blog post">
      <header className={styles.header}>
        <Button asChild variant="ghost">
          <Link href="/admin/blog">← Posts</Link>
        </Button>
        <h1 className={styles.title}>{title || "Untitled post"}</h1>
        <Button form="new-blog-post" type="submit" loading={pending} disabled={!title.trim()}>
          Create draft
        </Button>
      </header>
      <div className={styles.scroll}>
        <form
          id="new-blog-post"
          className={styles.article}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Label htmlFor="new-blog-title" className="text-xs text-muted-foreground">
            TITLE
          </Label>
          <Textarea
            id="new-blog-title"
            className={styles.postTitle}
            rows={1}
            autoFocus
            required
            maxLength={200}
            value={title}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give your story a title…"
          />
          <p className="mt-[22px] text-[19px] leading-relaxed text-muted-foreground">
            Create your private draft to start writing and add a cover image.
          </p>
          <p className="mt-[22px] text-sm text-muted-foreground">
            Your permanent URL is created from this title. You can change the title later.
          </p>
          {error && (
            <AlertBanner variant="error" className="mt-6">
              {error}
            </AlertBanner>
          )}
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
