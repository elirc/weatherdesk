"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionNav } from "@/app/dashboard/_components/nav";
import type { Outline } from "@/lib/api/outline";
import { acceptInvitationAction, createOrgAction } from "../actions";
import {
  createApiKeyAction,
  createLgaAreaAction,
  createPolygonAreaAction,
  generateBrandedReportAction,
  inviteMemberAction,
  previewPolygonAction,
  saveBrandingAction,
  updateMemberRoleAction,
} from "../[orgId]/actions";

export function OrgNav() {
  const { orgId } = useParams<{ orgId: string }>();
  const base = `/org/${orgId}`;
  return (
    <SectionNav
      links={[
        { href: base, label: "Team" },
        { href: `${base}/areas`, label: "Custom areas" },
        { href: `${base}/reports`, label: "Branded reports" },
        { href: `${base}/downloads`, label: "Downloads" },
        { href: `${base}/api-keys`, label: "API keys" },
        { href: `${base}/billing`, label: "Billing" },
      ]}
    />
  );
}

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createOrgAction({ name });
          if (!res.ok) return void toast.error(res.error);
          router.push(`/org/${res.data!.id}`);
        });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Organisation name, e.g. Green Valley Farms"
        className="max-w-sm"
        aria-label="Organisation name"
        minLength={2}
        required
      />
      <Button type="submit" disabled={pending} data-testid="create-org">
        {pending ? "Creating…" : "Create organisation"}
      </Button>
    </form>
  );
}

export function AcceptInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acceptInvitationAction({ invitationId });
          if (!res.ok) return void toast.error(res.error);
          router.push(`/org/${res.data!.organizationId}`);
        })
      }
    >
      {pending ? "Joining…" : "Accept invitation"}
    </Button>
  );
}

export function InviteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await inviteMemberAction({ organizationId, email, role });
            if (!res.ok) return void toast.error(res.error);
            setLink(res.data!.link);
            setEmail("");
            router.refresh();
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-64" />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
            <SelectTrigger className="w-32" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      {link && (
        <Alert>
          <AlertDescription className="break-all">
            Invitation created. Email delivery isn&apos;t wired for invites yet — share this link (also in the server log):{" "}
            <code className="text-xs">{link}</code>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function RoleSelect({ organizationId, memberId, role }: { organizationId: string; memberId: string; role: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await updateMemberRoleAction({ organizationId, memberId, role: v as "member" | "admin" });
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      <SelectTrigger className="h-8 w-28" aria-label="Member role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">member</SelectItem>
        <SelectItem value="admin">admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

type LgaOpt = { id: number; name: string; stateName: string };

/** Searchable multi-select of LGAs grouped by state. */
export function LgaSetForm({ organizationId, lgas }: { organizationId: string; lgas: LgaOpt[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(lgas.map((l) => [l.id, l])), [lgas]);
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const m = new Map<string, LgaOpt[]>();
    for (const l of lgas) {
      if (f && !l.name.toLowerCase().includes(f) && !l.stateName.toLowerCase().includes(f)) continue;
      const arr = m.get(l.stateName) ?? [];
      arr.push(l);
      m.set(l.stateName, arr);
    }
    return [...m.entries()];
  }, [lgas, filter]);

  function toggle(id: number, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createLgaAreaAction({ organizationId, name, lgaIds: [...selected] });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Area created");
          setName("");
          setSelected(new Set());
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="lga-area-name">Area name</Label>
        <Input id="lga-area-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lga-filter">LGAs</Label>
        <Input id="lga-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by LGA or state…" />
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1">
          {[...selected].map((id) => (
            <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => toggle(id, false)}>
              {byId.get(id)?.name} ✕
            </Badge>
          ))}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded-md border p-2 text-sm" role="group" aria-label="LGAs by state">
        {groups.length === 0 && <p className="p-2 text-muted-foreground">No matches.</p>}
        {groups.map(([state, items]) => (
          <fieldset key={state} className="mb-2">
            <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">{state}</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {items.map((l) => (
                <label key={l.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted">
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={(v) => toggle(l.id, v === true)} />
                  {l.name}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <Button type="submit" disabled={pending || selected.size === 0 || name.trim().length < 2} data-testid="create-lga-area">
        {pending ? "Saving…" : `Create area (${selected.size} LGA${selected.size === 1 ? "" : "s"})`}
      </Button>
    </form>
  );
}

const SAMPLE = JSON.stringify(
  {
    type: "Polygon",
    coordinates: [
      [
        [7.35, 10.45],
        [7.6, 10.45],
        [7.6, 10.65],
        [7.35, 10.65],
        [7.35, 10.45],
      ],
    ],
  },
  null,
  0,
);

export function PolygonForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [geojson, setGeojson] = useState("");
  const [preview, setPreview] = useState<{ outline: Outline; vertices: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createPolygonAreaAction({ organizationId, name, geojson });
          if (!res.ok) return setError(res.error);
          toast.success("Area created");
          setName("");
          setGeojson("");
          setPreview(null);
          setError(null);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="poly-name">Area name</Label>
        <Input id="poly-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="poly-geojson">GeoJSON Polygon or MultiPolygon ([longitude, latitude])</Label>
        <Textarea
          id="poly-geojson"
          value={geojson}
          onChange={(e) => {
            setGeojson(e.target.value);
            setPreview(null);
          }}
          rows={6}
          className="font-mono text-xs"
          placeholder={SAMPLE}
        />
        <button type="button" className="text-xs underline underline-offset-4" onClick={() => setGeojson(SAMPLE)}>
          Insert sample (near Kaduna)
        </button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview && (
        <figure className="space-y-1">
          <svg
            viewBox={`0 0 ${preview.outline.width} ${preview.outline.height}`}
            className="h-44 w-full max-w-sm rounded-md border bg-muted/40"
            role="img"
            aria-label="Area outline preview"
          >
            <path d={preview.outline.d} className="fill-emerald-500/25 stroke-emerald-700" strokeWidth={1.5} />
          </svg>
          <figcaption className="text-xs text-muted-foreground">Valid shape · {preview.vertices} vertices</figcaption>
        </figure>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || geojson.length < 10}
          onClick={() =>
            start(async () => {
              const res = await previewPolygonAction({ organizationId, geojson });
              if (!res.ok) {
                setPreview(null);
                return setError(res.error);
              }
              setError(null);
              setPreview(res.data!);
            })
          }
        >
          Preview
        </Button>
        <Button type="submit" disabled={pending || !preview || name.trim().length < 2}>
          {pending ? "Saving…" : "Create area"}
        </Button>
      </div>
    </form>
  );
}

export function BrandingForm({ organizationId, brandTitle }: { organizationId: string; brandTitle: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      action={(fd) =>
        start(async () => {
          const res = await saveBrandingAction(fd);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Branding saved");
          router.refresh();
        })
      }
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-1">
        <Label htmlFor="brand-title">Report title</Label>
        <Input id="brand-title" name="brandTitle" defaultValue={brandTitle ?? ""} placeholder="e.g. Acme Farms Weather Desk" maxLength={80} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="brand-logo">Logo (PNG or JPEG, ≤ 500 KB)</Label>
        <Input id="brand-logo" name="logo" type="file" accept="image/png,image/jpeg" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </Button>
    </form>
  );
}

export function GenerateReportForm({
  organizationId,
  areas,
}: {
  organizationId: string;
  areas: { id: string; name: string }[];
}) {
  const [scope, setScope] = useState(areas[0] ? `area:${areas[0].id}` : "national");
  const [type, setType] = useState<"weekly" | "monthly">("weekly");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await generateBrandedReportAction({ organizationId, scopeKey: scope, type });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Queued — the report and its PDF appear here within a minute or two.");
          setTimeout(() => router.refresh(), 8000);
        });
      }}
    >
      <div className="space-y-1">
        <Label>Scope</Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="w-60" aria-label="Report scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a.id} value={`area:${a.id}`}>
                {a.name}
              </SelectItem>
            ))}
            <SelectItem value="national">Nigeria (branded national copy)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as "weekly" | "monthly")}>
          <SelectTrigger className="w-32" aria-label="Report type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Queuing…" : "Generate now"}
      </Button>
    </form>
  );
}

export function CreateKeyForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [plain, setPlain] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createApiKeyAction({ organizationId, name });
            if (!res.ok) return void toast.error(res.error);
            setPlain(res.data!.plaintext);
            setName("");
            router.refresh();
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. Irrigation controller"
          className="max-w-xs"
          aria-label="Key name"
          required
          minLength={2}
        />
        <Button type="submit" disabled={pending} data-testid="create-api-key">
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>
      {plain && (
        <Alert data-testid="api-key-plaintext">
          <AlertDescription className="space-y-2">
            <p className="font-medium">Copy this key now — it will not be shown again.</p>
            <code className="block break-all rounded bg-muted p-2 text-xs">{plain}</code>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(plain).then(() => toast.success("Copied"))}
              >
                Copy
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPlain(null)}>
                I&apos;ve saved it
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function DownloadForm({
  organizationId,
  areas,
  defaultFrom,
  defaultTo,
}: {
  organizationId: string;
  areas: { id: string; name: string }[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [area, setArea] = useState(areas[0]?.id ?? "");
  const [dataset, setDataset] = useState<"observed" | "forecast">("observed");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  if (!areas.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a <Link href={`/org/${organizationId}/areas`} className="underline">custom area</Link> first.
      </p>
    );
  }
  const href = (format: "csv" | "xlsx") => {
    const q = new URLSearchParams({ area, dataset, format });
    if (dataset === "observed") {
      q.set("from", from);
      q.set("to", to);
    }
    return `/org/${organizationId}/downloads/file?${q.toString()}`;
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Area</Label>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger aria-label="Area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Dataset</Label>
        <Select value={dataset} onValueChange={(v) => setDataset(v as "observed" | "forecast")}>
          <SelectTrigger aria-label="Dataset">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="observed">Observed daily (history)</SelectItem>
            <SelectItem value="forecast">Forecast daily (next 16 days)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {dataset === "observed" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="dl-from">From</Label>
            <Input id="dl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dl-to">To (max 1 year)</Label>
            <Input id="dl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button asChild>
          <a href={href("csv")} download>
            Download CSV
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={href("xlsx")} download>
            Download Excel
          </a>
        </Button>
      </div>
    </div>
  );
}
