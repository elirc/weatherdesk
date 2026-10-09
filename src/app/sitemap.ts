import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { env } from "@/lib/env";
import { listAllLgas, listStates } from "@/server/queries/geo";

/**
 * sitemap.xml — home, info pages, every state and every LGA place page
 * (~820 URLs). Cached for a day; geography only changes on re-seed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("days");
  const base = env.APP_URL.replace(/\/$/, "");
  const now = new Date();
  const [states, lgas] = await Promise.all([listStates(), listAllLgas()]);
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/alerts`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/reports`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/accuracy`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
  return [
    ...fixed,
    ...states.map((s) => ({
      url: `${base}/place/state/${s.slug}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...lgas.map((l) => ({
      url: `${base}/place/lga/${l.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
