/**
 * URL slugs for places. Pure and DB-free (unit-tested in tests/unit/geo).
 *
 * slugify("Akwa Ibom")        → "akwa-ibom"
 * slugify("Jama'are")         → "jamaare"
 * slugify("Ado-Ekiti / Ado")  → "ado-ekiti-ado"
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/['’`]/g, "") // apostrophes vanish instead of splitting words
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Globally unique LGA slugs. LGA names repeat across states (Surulere,
 * Obi, Bassa, Ifelodun, Irepodun), so when two or more LGAs produce the same
 * base slug, EVERY one of them gets `-<state-slug>` appended — deterministic
 * regardless of input order ("obi-benue", "obi-nasarawa").
 * If a suffixed slug still collides (same name twice in one state), a
 * numeric suffix is added in input order.
 */
export function uniqueLgaSlugs(items: { name: string; stateSlug: string }[]): string[] {
  const base = items.map((i) => slugify(i.name));
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b, (counts.get(b) ?? 0) + 1);

  const used = new Set<string>();
  return items.map((item, idx) => {
    let s = base[idx];
    if ((counts.get(s) ?? 0) > 1) s = `${s}-${item.stateSlug}`;
    let candidate = s;
    let n = 2;
    while (used.has(candidate)) candidate = `${s}-${n++}`;
    used.add(candidate);
    return candidate;
  });
}
