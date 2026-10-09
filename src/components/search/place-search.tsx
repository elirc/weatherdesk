"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Place search combobox (shadcn command). Queries /api/geo/search (the
 * rate-limited route handler) with a debounce; results carry kind badges and
 * navigate on select.
 */

type Hit = {
  kind: "state" | "lga" | "settlement";
  id: number;
  name: string;
  context: string;
  href: string;
};

const KIND_LABEL: Record<Hit["kind"], string> = { state: "State", lga: "LGA", settlement: "Settlement" };
const MIN_CHARS = 2;

export function PlaceSearch({
  placeholder = "Search a state, LGA or town…",
  compact = false,
}: {
  placeholder?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error" | "limited">("idle");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(term)}&limit=8`, {
          signal: ctrl.signal,
        });
        if (res.status === 429) {
          setStatus("limited");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: Hit[] };
        setHits(body.results);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = q.trim();
  const showList = open && term.length >= MIN_CHARS;

  return (
    <div ref={boxRef} className={compact ? "relative w-full max-w-sm" : "relative w-full max-w-xl"}>
      <Command shouldFilter={false} className="rounded-lg border shadow-sm" label="Search places">
        <CommandInput
          value={q}
          onValueChange={(v) => {
            setQ(v);
            setOpen(true);
            if (v.trim().length < MIN_CHARS) {
              setHits([]);
              setStatus("idle");
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-label="Search places"
        />
        {showList && (
          <CommandList className="absolute top-full right-0 left-0 z-50 mt-1 max-h-80 rounded-lg border bg-popover shadow-lg">
            {status === "loading" && hits.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
            )}
            {status === "error" && <p className="px-3 py-2 text-sm text-destructive">Search failed — try again.</p>}
            {status === "limited" && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Too many searches — wait a moment.</p>
            )}
            {status === "done" && <CommandEmpty>No places found.</CommandEmpty>}
            {hits.length > 0 && (
              <CommandGroup>
                {hits.map((h) => (
                  <CommandItem
                    key={`${h.kind}-${h.id}`}
                    value={`${h.kind}-${h.id}`}
                    onSelect={() => {
                      setOpen(false);
                      router.push(h.href);
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{h.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{h.context}</span>
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {KIND_LABEL[h.kind]}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
