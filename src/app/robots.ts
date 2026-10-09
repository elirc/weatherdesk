import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** robots.txt — allow all public pages; keep private/app areas out of indexes. */
export default function robots(): MetadataRoute.Robots {
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/staff", "/dashboard", "/org", "/api"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
