"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { AdminPageHeader } from "@/app/admin/(protected)/components/AdminPageHeader";
import {
  Button,
  Field,
  FieldLegend,
  FieldSet,
  Input,
  Muted,
  Card,
  ContentState,
  Toaster,
  toast,
} from "@/components/ui/index.tsx";
import type { DownloadPolicy, OwnerDownloadLimits } from "@/lib/downloaders/contracts";

const ENDPOINT = "/api/admin/downloaders/policy";
// Matches the backend's validateDownloadPolicyInput capacity ceilings.
const FIELDS = [
  { key: "daily", label: "Daily jobs", maximum: 1_000_000, help: "Total jobs admitted per day." },
  { key: "active", label: "Active jobs", maximum: 250, help: "Jobs processing at the same time." },
  { key: "queued", label: "Queued jobs", maximum: 10_000, help: "Jobs waiting to start." },
] as const;
const GROUPS = [
  { key: "guest", label: "Per guest" },
  { key: "account", label: "Per signed-in account" },
] as const;
type Group = (typeof GROUPS)[number]["key"];
type Draft = Record<Group, Record<keyof OwnerDownloadLimits, string>>;
const limitsSchema = z.object({
  daily: z.number().int().min(1).max(1_000_000),
  active: z.number().int().min(1).max(250),
  queued: z.number().int().min(1).max(10_000),
});
const responseSchema = z.object({
  policy: z.object({
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    guest: limitsSchema,
    account: limitsSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  }),
});
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

function toDraft(policy: DownloadPolicy): Draft {
  const strings = (limits: OwnerDownloadLimits) => ({
    daily: String(limits.daily),
    active: String(limits.active),
    queued: String(limits.queued),
  });
  return { guest: strings(policy.guest), account: strings(policy.account) };
}

function fieldError(value: string, maximum: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= maximum
    ? undefined
    : `Enter a whole number from 1 to ${maximum.toLocaleString("en-US")}.`;
}

export function DownloaderLimitsForm({ canEdit }: { canEdit: boolean }) {
  const [policy, setPolicy] = useState<DownloadPolicy | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | null>("load");
  const [status, setStatus] = useState("Loading downloader limits…");
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const requestInFlight = useRef(false);
  const dirty = Boolean(
    policy &&
    draft &&
    GROUPS.some(({ key: group }) => FIELDS.some(({ key }) => draft[group][key] !== String(policy[group][key]))),
  );

  async function load(signal?: AbortSignal) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy("load");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin", signal });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(errorSchema.safeParse(body).data?.error.message ?? "Unable to load limits. Try again.");
      const latest = responseSchema.parse(body).policy;
      if (signal?.aborted) return;
      const keepDraft = canEdit && dirty;
      setPolicy(latest);
      // Only unsaved edits survive a reload; view-only and unchanged fields show current values.
      setDraft((current) => (keepDraft ? current : toDraft(latest)));
      setConflict(false);
      setReview(keepDraft);
      setStatus(
        keepDraft
          ? "Latest limits loaded. Your draft has been kept. Review it against the saved values before saving."
          : "Limits loaded.",
      );
    } catch (error) {
      if (signal?.aborted) return;
      setStatus("Limits could not be loaded. Your draft has not changed. Retry loading to continue.");
      toast.error(
        error instanceof Error && !(error instanceof z.ZodError)
          ? error.message
          : "The server returned invalid limits. Try loading again.",
      );
    } finally {
      requestInFlight.current = false;
      if (!signal?.aborted) setBusy(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // Defer so a Strict Mode effect cleanup cannot suppress the next load.
    const timer = setTimeout(() => void load(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !policy || !draft || !dirty || conflict || requestInFlight.current) return;
    setSubmitted(true);
    const invalid = GROUPS.flatMap(({ key: group }) =>
      FIELDS.map(({ key, maximum }) => ({
        id: `${group}-${key}`,
        error: fieldError(draft[group][key], maximum),
      })),
    ).find(({ error }) => error);
    if (invalid) {
      document.getElementById(invalid.id)?.focus();
      return;
    }
    const values = (group: Group): OwnerDownloadLimits => ({
      daily: Number(draft[group].daily),
      active: Number(draft[group].active),
      queued: Number(draft[group].queued),
    });
    requestInFlight.current = true;
    setBusy("save");
    try {
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: policy.version, guest: values("guest"), account: values("account") }),
      });
      if (response.status === 409) {
        setConflict(true);
        setStatus(
          "Another admin changed these limits. Your draft is kept. Load the latest limits, compare the saved values, then save again.",
        );
        toast.error("Limits changed. Reload them before saving again.");
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(errorSchema.safeParse(body).data?.error.message ?? "Unable to save limits. Try again.");
      const saved = responseSchema.parse(body).policy;
      setPolicy(saved);
      setDraft(toDraft(saved));
      setReview(false);
      setSubmitted(false);
      setTouched({});
      setStatus("Limits saved. Existing daily usage has not been reset.");
      toast.success("Downloader limits saved.");
    } catch (error) {
      setStatus("Save could not be confirmed. Your draft is kept. Load the latest limits before trying again.");
      setConflict(true);
      toast.error(
        error instanceof Error && !(error instanceof z.ZodError)
          ? error.message
          : "Save could not be confirmed. Load the latest limits.",
      );
    } finally {
      requestInFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <Toaster position="top-right" />
      <AdminPageHeader
        className="mb-0 shrink-0"
        title="Downloader limits"
        description="Manage download allowances per guest and account across all platforms."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              loading={busy === "load"}
              onClick={() => void load()}
            >
              {busy === "load" ? "Loading…" : "Reload limits"}
            </Button>
            {canEdit && dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== null || conflict}
                onClick={() => {
                  if (!policy) return;
                  setDraft(toDraft(policy));
                  setSubmitted(false);
                  setTouched({});
                  setReview(false);
                  setStatus("Draft discarded. Saved limits restored.");
                }}
              >
                Discard draft
              </Button>
            )}
            {canEdit && (
              <Button
                form="downloader-limits"
                type="submit"
                disabled={busy !== null || !dirty || conflict}
                loading={busy === "save"}
              >
                {busy === "save" ? "Saving…" : "Save limits"}
              </Button>
            )}
          </>
        }
      />
      <form
        id="downloader-limits"
        onSubmit={save}
        noValidate
        aria-busy={busy !== null}
        className="flex flex-1 flex-col gap-5"
      >
        {!canEdit && <Muted>View only. You need downloader edit permission to change these limits.</Muted>}
        {policy && draft ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {GROUPS.map(({ key: group, label }) => (
              <Card key={group} className="min-w-0 gap-0 overflow-hidden p-0 shadow-none">
                <FieldSet disabled={busy !== null} className="min-w-0 gap-0">
                  <div className="border-b border-border bg-muted/60 px-5 py-4">
                    <FieldLegend className="mb-0">{label}</FieldLegend>
                  </div>
                  <div className="grid gap-4 p-5 sm:grid-cols-3 xl:grid-cols-1">
                    {FIELDS.map(({ key, label: fieldLabel, maximum, help }) => {
                      const id = `${group}-${key}`;
                      const error = submitted || touched[id] ? fieldError(draft[group][key], maximum) : undefined;
                      return (
                        <Field
                          key={key}
                          htmlFor={id}
                          label={fieldLabel}
                          error={error}
                          description={`${help} Maximum ${maximum.toLocaleString("en-US")}.${review && dirty ? ` Saved: ${policy[group][key].toLocaleString("en-US")}.` : ""}`}
                        >
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={draft[group][key]}
                            readOnly={!canEdit}
                            onBlur={() => setTouched((current) => ({ ...current, [id]: true }))}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraft(
                                (current) => current && { ...current, [group]: { ...current[group], [key]: value } },
                              );
                            }}
                          />
                        </Field>
                      );
                    })}
                  </div>
                </FieldSet>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-0 shadow-none">
            <ContentState
              state={busy === "load" ? "loading" : "error"}
              title={busy === "load" ? "Loading downloader limits" : "Limits unavailable"}
              description={
                busy === "load"
                  ? "Retrieving the current guest and account allowances."
                  : "Reload limits to try again. No settings have been changed."
              }
              density="panel"
            />
          </Card>
        )}
        <p role="status" className={conflict || review ? "text-sm text-muted-foreground" : "sr-only"}>
          {status}
        </p>
        <Muted className="mt-auto pt-4">
          Daily limits reset at 00:00 UTC. Accepted jobs count even if they fail or are cancelled. Changing limits does
          not reset usage or cancel existing jobs.
        </Muted>
      </form>
    </div>
  );
}
