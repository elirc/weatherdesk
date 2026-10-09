"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/authz";
import { createDailySendAction, savePlaceAction, subscribeReportAction, togglePlaceAlertsAction } from "../actions";

type AnyAction<P> = (payload: P) => Promise<ActionResult<unknown>>;

/** Generic button that runs a server action with a JSON payload, toasts the result, refreshes. */
export function ActionButton<P>({
  action,
  payload,
  label,
  pendingLabel,
  confirm,
  variant = "outline",
  size = "sm",
  testId,
}: {
  action: AnyAction<P>;
  payload: P;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "sm" | "default";
  testId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      data-testid={testId}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const res = await action(payload);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : label}
    </Button>
  );
}

/** Starts a Paystack checkout (server action returns the hosted checkout URL). */
export function CheckoutButton({
  action,
  label,
  payload,
  testId,
}: {
  action: (payload: never) => Promise<ActionResult<{ url: string }>>;
  label: string;
  payload?: unknown;
  testId?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      data-testid={testId}
      onClick={() =>
        start(async () => {
          const res = await (action as (p: unknown) => Promise<ActionResult<{ url: string }>>)(payload);
          if (!res.ok) return void toast.error(res.error);
          if (res.data?.url) window.location.assign(res.data.url);
        })
      }
    >
      {pending ? "Opening checkout…" : label}
    </Button>
  );
}

type Hit = { kind: "state" | "lga" | "settlement"; id: number; name: string; context: string };

/** Search box (A3's /api/geo/search) that saves the chosen place. */
export function PlacePicker() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "limited">("idle");
  const [pending, start] = useTransition();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(term)}&limit=8`, { signal: ctrl.signal });
        if (res.status === 429) return setStatus("limited");
        if (!res.ok) throw new Error(String(res.status));
        setHits(((await res.json()) as { results: Hit[] }).results);
        setStatus("idle");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  function save(payload: Parameters<typeof savePlaceAction>[0], name: string) {
    start(async () => {
      const res = await savePlaceAction(payload);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Saved ${name}`);
      setQ("");
      setHits([]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) setHits([]);
          }}
          placeholder="Add a place: state, LGA or town…"
          aria-label="Search a place to save"
          data-testid="place-picker-input"
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (p) => save({ kind: "point", lat: p.coords.latitude, lon: p.coords.longitude, name: "My location" }, "your location"),
              () => toast.error("Location unavailable"),
            )
          }
        >
          Use my location
        </Button>
      </div>
      {status === "loading" && <p className="text-sm text-muted-foreground">Searching…</p>}
      {status === "error" && <p className="text-sm text-destructive">Search failed — try again.</p>}
      {status === "limited" && <p className="text-sm text-muted-foreground">Too many searches — wait a moment.</p>}
      {hits.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{h.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{h.context}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {h.kind === "lga" ? "LGA" : h.kind}
                </Badge>
                <Button size="sm" disabled={pending} onClick={() => save({ kind: h.kind, id: h.id }, h.name)}>
                  Save
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AlertsToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(v) =>
          start(async () => {
            const res = await togglePlaceAlertsAction({ id, enabled: v });
            if (!res.ok) toast.error(res.error);
            router.refresh();
          })
        }
        aria-label="Advisory alerts"
      />
      Alerts
    </label>
  );
}

export function ReportSubscribeForm({ states }: { states: { id: number; name: string }[] }) {
  const router = useRouter();
  const [type, setType] = useState<"weekly" | "monthly">("weekly");
  const [scope, setScope] = useState("national");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await subscribeReportAction({ reportType: type, scopeKey: scope });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Subscribed");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label>Report</Label>
        <Select value={type} onValueChange={(v) => setType(v as "weekly" | "monthly")}>
          <SelectTrigger className="w-36" aria-label="Report type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Area</Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-60" aria-label="Report area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="national">Nigeria (national)</SelectItem>
            {states.map((s) => (
              <SelectItem key={s.id} value={`state:${s.id}`}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending} data-testid="subscribe-report">
        {pending ? "Subscribing…" : "Subscribe"}
      </Button>
    </form>
  );
}

export function DailySendForm({
  places,
  defaultPhone,
}: {
  places: { id: string; name: string }[];
  defaultPhone: string;
}) {
  const router = useRouter();
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [hour, setHour] = useState("6");
  const [phone, setPhone] = useState(defaultPhone);
  const [pending, start] = useTransition();
  if (!places.length) return <p className="text-sm text-muted-foreground">Save a place first, then pick it here.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createDailySendAction({ savedPlaceId: placeId, channel, hour: Number(hour), phone });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Daily forecast scheduled");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label>Place</Label>
        <Select value={placeId} onValueChange={setPlaceId}>
          <SelectTrigger aria-label="Place">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {places.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Channel</Label>
        <Select value={channel} onValueChange={(v) => setChannel(v as "sms" | "whatsapp")}>
          <SelectTrigger aria-label="Channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Send time (Lagos)</Label>
        <Select value={hour} onValueChange={setHour}>
          <SelectTrigger aria-label="Send time">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {Array.from({ length: 24 }, (_, h) => (
              <SelectItem key={h} value={String(h)}>
                {`${String(h).padStart(2, "0")}:00`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="daily-phone">Phone</Label>
        <Input id="daily-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0803 123 4567" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Schedule daily forecast"}
        </Button>
      </div>
    </form>
  );
}
