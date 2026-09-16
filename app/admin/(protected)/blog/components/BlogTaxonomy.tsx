"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, EmptyState, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@smarttools/ui";
import { mutateBlogAction } from "../actions";

interface Props {
  kind: "category" | "tag";
  terms: { id: string; name: string; createdBy: string | null; updatedBy: string | null; updatedAt: Date }[];
  returnTo?: string;
}

export function BlogTaxonomy({ kind, terms, returnTo }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(value: { id?: string; name: string }) {
    if (pending || !value.name.trim()) return;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await mutateBlogAction("saveTerm", { kind, ...value, name: value.name.trim() });
      if (!result.ok) { setError(result.message); return; }
      if (!value.id && returnTo) { router.push(returnTo); router.refresh(); return; }
      if (!value.id) setName("");
      if (value.id) setEditing(null); setMessage(value.id ? "Name updated." : `${kind === "category" ? "Category" : "Tag"} created.`); router.refresh();
    } catch { setError("Couldn’t save the name. Try again."); }
    finally { setPending(false); }
  }
  return <div className="space-y-6">
    <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{kind === "category" ? "Organize stories by topic with clear, recognizable names." : "Add specific themes that help readers discover related stories."} Names are shared across posts.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void save({ name }); }}>
      <div className="grid min-w-0 flex-1 gap-2"><Label htmlFor="blog-term-name">New {kind}</Label><Input id="blog-term-name" placeholder={kind === "category" ? "e.g. Business" : "e.g. Freelancing"} value={name} maxLength={100} required disabled={pending || !!editing} onChange={(event) => setName(event.target.value)} /></div><Button type="submit" loading={pending && !editing} disabled={pending || !!editing || !name.trim()}>Add {kind}</Button>
    </form>
    {editing && <p className="text-sm text-muted-foreground" role="status">Save or cancel this rename before editing another name or adding a {kind}.</p>}
    {error && <AlertBanner variant="error">{error}</AlertBanner>}{message && <div role="status"><AlertBanner variant="success">{message}</AlertBanner></div>}
    {terms.length ? <Table className="table-fixed"><TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden sm:table-cell">Last updated</TableHead><TableHead className="w-36 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
      {terms.map((term) => <TableRow key={term.id}><TableCell className="whitespace-normal">{editing?.id === term.id ? <Input aria-label={`Rename ${term.name}`} maxLength={100} value={editing.name} disabled={pending} onChange={(event) => setEditing({ id: term.id, name: event.target.value })} /> : <span className="break-words font-medium">{term.name}</span>}<p className="mt-1 text-xs text-muted-foreground sm:hidden">Updated {new Date(term.updatedAt).toISOString().slice(0, 10)}</p><details className="mt-2 text-xs text-muted-foreground sm:hidden"><summary className="cursor-pointer">Account attribution</summary><p className="mt-2 break-all">Created by: {term.createdBy ?? "Deleted account"}</p><p className="mt-1 break-all">Last edited by: {term.updatedBy ?? "Deleted account"}</p></details></TableCell>
        <TableCell className="hidden max-w-64 whitespace-normal text-xs text-muted-foreground sm:table-cell"><p>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(term.updatedAt))}</p><details className="mt-2"><summary className="cursor-pointer">Account attribution</summary><p className="mt-2 break-all">Created by: {term.createdBy ?? "Deleted account"}</p><p className="mt-1 break-all">Last edited by: {term.updatedBy ?? "Deleted account"}</p></details></TableCell>
        <TableCell><div className="flex justify-end gap-2">{editing?.id === term.id ? <><Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" loading={pending} disabled={!editing.name.trim()} onClick={() => { void save(editing); }}>Save</Button></> : <Button size="sm" variant="ghost" disabled={pending || !!editing} onClick={() => setEditing({ id: term.id, name: term.name })}>Rename</Button>}</div></TableCell>
      </TableRow>)}
    </TableBody></Table> : <EmptyState title={`No ${kind === "category" ? "categories" : "tags"} yet`} description={`Add a ${kind} above to make it available to all posts.`} />}
  </div>;
}
