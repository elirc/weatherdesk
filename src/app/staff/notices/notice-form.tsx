"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useStaffAction } from "../_components/use-action";
import { Pill, selectClass } from "../_components/ui";
import { NOTICE_FIXED_SCOPES } from "../_lib/policy";
import { createNoticeAction, setNoticeActiveAction, updateNoticeAction } from "./actions";

type NoticeValues = { title: string; body: string; scope: string; active: boolean; expiresOn: string };
const EMPTY: NoticeValues = { title: "", body: "", scope: "global", active: true, expiresOn: "" };

function NoticeFields({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string;
  values: NoticeValues;
  onChange: (v: NoticeValues) => void;
}) {
  const isFixed = (NOTICE_FIXED_SCOPES as readonly string[]).includes(values.scope);
  const set = <K extends keyof NoticeValues>(k: K, v: NoticeValues[K]) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor={`${idPrefix}-title`} className="text-xs text-muted-foreground">
          Title
        </label>
        <Input id={`${idPrefix}-title`} value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${idPrefix}-body`} className="text-xs text-muted-foreground">
          Body
        </label>
        <Textarea id={`${idPrefix}-body`} value={values.body} onChange={(e) => set("body", e.target.value)} rows={3} maxLength={2000} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-scope`} className="text-xs text-muted-foreground">
            Where
          </label>
          <select
            id={`${idPrefix}-scope`}
            value={isFixed ? values.scope : "place"}
            onChange={(e) => set("scope", e.target.value === "place" ? "place:lga:" : e.target.value)}
            className={selectClass}
          >
            <option value="global">All pages (global)</option>
            <option value="home">Home page</option>
            <option value="alerts">Alerts page</option>
            <option value="reports">Reports pages</option>
            <option value="place">One place…</option>
          </select>
        </div>
        {!isFixed && (
          <div className="grid gap-1">
            <label htmlFor={`${idPrefix}-place`} className="text-xs text-muted-foreground">
              Place scope (place:&lt;state|lga|settlement&gt;:&lt;id&gt;)
            </label>
            <Input id={`${idPrefix}-place`} value={values.scope} onChange={(e) => set("scope", e.target.value)} className="w-64 font-mono text-xs" />
          </div>
        )}
        <div className="grid gap-1">
          <label htmlFor={`${idPrefix}-expires`} className="text-xs text-muted-foreground">
            Expires after (Lagos date, optional)
          </label>
          <Input id={`${idPrefix}-expires`} type="date" value={values.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} className="w-44" />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch checked={values.active} onCheckedChange={(v) => set("active", v)} aria-label="Active" />
          Active
        </label>
      </div>
    </div>
  );
}

export function NoticeForm() {
  const [values, setValues] = useState<NoticeValues>(EMPTY);
  const [create, creating] = useStaffAction(createNoticeAction, "Notice created", () => setValues(EMPTY));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        create(values);
      }}
    >
      <NoticeFields idPrefix="new" values={values} onChange={setValues} />
      <Button type="submit" size="sm" disabled={creating || !values.title.trim() || !values.body.trim()}>
        {creating ? "Creating…" : "Create notice"}
      </Button>
    </form>
  );
}

export function NoticeRowActions({
  notice,
  meta,
}: {
  notice: NoticeValues & { id: string };
  meta: { status: "live" | "inactive" | "expired"; created: string; expires: string | null };
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<NoticeValues>(notice);
  const [save, saving] = useStaffAction(updateNoticeAction, "Notice updated");
  const [toggle, toggling] = useStaffAction(setNoticeActiveAction, notice.active ? "Notice deactivated" : "Notice activated");
  const tone = meta.status === "live" ? "green" : meta.status === "expired" ? "amber" : "muted";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {notice.title} <Pill tone={tone}>{meta.status}</Pill> <Pill>{notice.scope}</Pill>
          </p>
          {!editing && <p className="whitespace-pre-line text-sm">{notice.body}</p>}
          <p className="text-xs text-muted-foreground">
            Created {meta.created}
            {meta.expires && ` · expires ${meta.expires}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant={notice.active ? "destructive" : "outline"}
            disabled={toggling}
            onClick={() => toggle({ id: notice.id, active: !notice.active })}
          >
            {notice.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>
      {editing && (
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save({ id: notice.id, ...values });
          }}
        >
          <NoticeFields idPrefix={notice.id} values={values} onChange={setValues} />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </div>
  );
}
