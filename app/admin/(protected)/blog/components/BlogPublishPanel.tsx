"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, AlertBanner, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge } from "@smarttools/ui";

import styles from "./BlogEditor.module.css";

export interface BlogScheduleValue {
  date: string;
  time: string;
  timezone: string;
}

interface BlogPublishPanelProps {
  mode: "now" | "schedule";
  onModeChange: (mode: "now" | "schedule") => void;
  schedule: BlogScheduleValue;
  onScheduleChange: (schedule: BlogScheduleValue) => void;
  timezones: readonly string[];
  minimumDate?: string;
  checks: readonly { id: string; label: string; valid: boolean }[];
  searchPreview: { title: string; description: string; url: string };
  onEditSeo: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onFixCheck: (id: string) => void;
  pending?: boolean;
  error?: string;
  canPublish?: boolean;
  hasLiveVersion?: boolean;
}

const TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`);

export function BlogPublishPanel({ mode, onModeChange, schedule, onScheduleChange, timezones, minimumDate, checks, searchPreview, onEditSeo, onBack, onSubmit, onFixCheck, pending = false, error, canPublish = false, hasLiveVersion = false }: BlogPublishPanelProps) {
  const failedChecks = checks.filter((check) => !check.valid);
  const ready = checks.length > 0 && failedChecks.length === 0;
  return (
    <form className={`${styles.publishPanel} space-y-5`} aria-busy={pending} onSubmit={(event) => { event.preventDefault(); if (ready && canPublish && !pending) onSubmit(); }}>
      <h2 className="text-lg font-semibold">{mode === "schedule" ? "Publication time" : "Publishing options"}</h2>
      <div className="grid gap-2"><Label className="text-[13px]" htmlFor="blog-publish-mode">When to publish</Label>
        <Select value={mode} disabled={pending} onValueChange={(value) => { if (value === "now" || value === "schedule") onModeChange(value); }}>
          <SelectTrigger size="sm" id="blog-publish-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem className="text-[13px]" value="now">Publish now</SelectItem><SelectItem className="text-[13px]" value="schedule">Schedule</SelectItem></SelectContent>
        </Select>
      </div>
      {mode === "schedule" && <>
        <div className="grid grid-cols-[minmax(0,1fr)_136px] gap-4">
          <div className="grid gap-2"><Label className="text-[13px]" htmlFor="blog-publish-date">Publication date</Label><Input size="sm" id="blog-publish-date" type="date" required min={minimumDate} disabled={pending} value={schedule.date} onChange={(event) => onScheduleChange({ ...schedule, date: event.target.value })} /></div>
          <div className="grid gap-2"><Label className="text-[13px]" htmlFor="blog-publish-time">Time (24-hour)</Label><Select required value={schedule.time} disabled={pending} onValueChange={(time) => onScheduleChange({ ...schedule, time })}>
            <SelectTrigger size="sm" id="blog-publish-time" className="w-full"><SelectValue placeholder="Select time" /></SelectTrigger>
            <SelectContent>{TIMES.map((time) => <SelectItem className="text-[13px]" key={time} value={time}>{time}</SelectItem>)}</SelectContent>
          </Select></div>
        </div>
        <div className="grid gap-2"><Label className="text-[13px]" htmlFor="blog-publish-timezone">Timezone</Label><Select required value={schedule.timezone} disabled={pending} onValueChange={(timezone) => onScheduleChange({ ...schedule, timezone })}>
          <SelectTrigger size="sm" id="blog-publish-timezone" className="w-full"><SelectValue placeholder="Select timezone" /></SelectTrigger>
          <SelectContent>{timezones.map((timezone) => <SelectItem className="text-[13px]" key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent>
        </Select></div>
        <p className="text-xs text-muted-foreground">Choose a future time. Publishing runs every 30 minutes; this post goes live on the next eligible run.</p>
        {schedule.date && <p className="text-[13px] font-semibold text-primary">{schedule.date} · {schedule.time} {schedule.timezone}</p>}
      </>}
      <Accordion type="single" collapsible hidden={mode === "schedule" && ready}
        key={ready ? "ready" : "needs-attention"} defaultValue={ready ? undefined : "checks"}>
        <AccordionItem value="checks">
          <AccordionTrigger className="py-3 text-[13px]" aria-label="Publishing checks">
            <StatusBadge variant={ready ? "success" : "warning"}>{ready ? `${checks.length} checks passed` : "Needs attention"}</StatusBadge>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-2">{checks.map(check => <li key={check.id} className={`flex items-start gap-2 ${check.valid ? "text-success" : "text-destructive"}`}>
              {check.valid ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
              <span>{check.label}</span>
            </li>)}</ul>
            {failedChecks[0] && <Button className="mt-3" size="xs" variant="outline" disabled={pending} onClick={() => onFixCheck(failedChecks[0].id)}>Fix {failedChecks[0].label.toLowerCase()}</Button>}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <section hidden={mode === "schedule"} className="space-y-2 border-t border-border pt-4" aria-label="Search preview">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[13px] font-semibold">Search preview</h3><Button size="xs" variant="ghost" onClick={onEditSeo} disabled={pending}>Edit SEO</Button></div>
        <p className="break-all text-xs text-muted-foreground">{searchPreview.url}</p>
        <p className="text-base text-primary">{searchPreview.title}</p>
        <p className="text-[13px] text-muted-foreground">{searchPreview.description}</p>
      </section>
      <AlertBanner title={mode === "schedule" ? hasLiveVersion ? "Current article stays live" : "Not public yet" : "Public immediately"}>
        {mode === "schedule" ? `${hasLiveVersion ? "The current article stays public until this update publishes. " : ""}Only this saved revision will go live. Later edits won’t change the scheduled version.` : "This saved revision will be visible to everyone. You can unpublish it later."}
      </AlertBanner>
      {error && <AlertBanner variant="error" title="Couldn’t publish">{error} Your draft is still available.</AlertBanner>}
      {!canPublish && <p className="text-[13px] text-muted-foreground">Publishing permission is required.</p>}
      <div className={`${styles.publishActions} flex items-center justify-end gap-3 border-t border-border pt-4`}>
        <Button size="sm" variant="ghost" onClick={onBack} disabled={pending}>Keep as draft</Button>
        <Button size="sm" type="submit" loading={pending} disabled={!canPublish || !ready}>{mode === "schedule" ? "Schedule post" : "Publish now"}</Button>
      </div>
    </form>
  );
}
